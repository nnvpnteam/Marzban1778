from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from operator import attrgetter
from typing import Dict, List, Tuple, Union

from pymysql.err import OperationalError
from sqlalchemy import and_, bindparam, insert, select, update
from sqlalchemy.orm import Session
from sqlalchemy.sql.dml import Insert

from app import logger, scheduler, xray
from app.db import GetDB, crud
from app.db.models import Admin, NodeUsage, NodeUserUsage, System, User
from config import (
    DISABLE_RECORDING_NODE_USAGE,
    JOB_RECORD_NODE_USAGES_INTERVAL,
    JOB_RECORD_USER_USAGES_INTERVAL,
)
from xray_api import XRay as XRayAPI
from xray_api import exc as xray_exc


def safe_execute(db: Session, stmt, params=None):
    if db.bind.name == 'mysql':
        if isinstance(stmt, Insert):
            stmt = stmt.prefix_with('IGNORE')

        tries = 0
        done = False
        while not done:
            try:
                db.connection().execute(stmt, params)
                db.commit()
                done = True
            except OperationalError as err:
                if err.args[0] == 1213 and tries < 3:  # Deadlock
                    db.rollback()
                    tries += 1
                    continue
                raise err

    else:
        db.connection().execute(stmt, params)
        db.commit()


def record_user_stats(params: list, node_id: Union[int, None],
                      consumption_factor: int = 1):
    if not params:
        return

    created_at = datetime.fromisoformat(datetime.utcnow().strftime('%Y-%m-%dT%H:00:00'))

    with GetDB() as db:
        # make user usage row if doesn't exist
        select_stmt = select(NodeUserUsage.user_id) \
            .where(and_(NodeUserUsage.node_id == node_id, NodeUserUsage.created_at == created_at))
        existings = [r[0] for r in db.execute(select_stmt).fetchall()]
        uids_to_insert = set()

        for p in params:
            uid = int(p['uid'])
            if uid in existings:
                continue
            uids_to_insert.add(uid)

        if uids_to_insert:
            stmt = insert(NodeUserUsage).values(
                user_id=bindparam('uid'),
                created_at=created_at,
                node_id=node_id,
                used_traffic=0
            )
            safe_execute(db, stmt, [{'uid': uid} for uid in uids_to_insert])

        # record
        stmt = update(NodeUserUsage) \
            .values(used_traffic=NodeUserUsage.used_traffic + bindparam('value') * consumption_factor) \
            .where(and_(NodeUserUsage.user_id == bindparam('uid'),
                        NodeUserUsage.node_id == node_id,
                        NodeUserUsage.created_at == created_at))
        safe_execute(db, stmt, params)


def record_node_stats(params: dict, node_id: Union[int, None]):
    if not params:
        return

    created_at = datetime.fromisoformat(datetime.utcnow().strftime('%Y-%m-%dT%H:00:00'))

    with GetDB() as db:

        # make node usage row if doesn't exist
        select_stmt = select(NodeUsage.node_id). \
            where(and_(NodeUsage.node_id == node_id, NodeUsage.created_at == created_at))
        notfound = db.execute(select_stmt).first() is None
        if notfound:
            stmt = insert(NodeUsage).values(created_at=created_at, node_id=node_id, uplink=0, downlink=0)
            safe_execute(db, stmt)

        # record
        stmt = update(NodeUsage). \
            values(uplink=NodeUsage.uplink + bindparam('up'), downlink=NodeUsage.downlink + bindparam('down')). \
            where(and_(NodeUsage.node_id == node_id, NodeUsage.created_at == created_at))

        safe_execute(db, stmt, params)


def _collect_user_stats_for_node(api: XRayAPI, coefficient: float) -> Tuple[
    List[dict], Dict[int, int], Dict[int, int]
]:
    """
    Returns (params for record_user_stats with uid/value),
            uplink bytes per uid this interval (after coefficient),
            downlink bytes per uid this interval.
    """
    upl = defaultdict(int)
    dnl = defaultdict(int)
    unk = defaultdict(int)
    try:
        for stat in filter(attrgetter('value'), api.get_users_stats(reset=True, timeout=30)):
            uid = int(stat.name.split('.', 1)[0])
            v = int(stat.value * coefficient)
            lk = (stat.link or "").lower()
            if lk == "uplink":
                upl[uid] += v
            elif lk == "downlink":
                dnl[uid] += v
            else:
                unk[uid] += v
    except xray_exc.XrayError:
        return [], {}, {}

    uids = set(upl) | set(dnl) | set(unk)
    params = []
    up_out: Dict[int, int] = {}
    dn_out: Dict[int, int] = {}
    for uid in uids:
        u_extra = upl[uid]
        d_extra = dnl[uid]
        u_part = u_extra + (unk[uid] // 2)
        d_part = d_extra + (unk[uid] - (unk[uid] // 2))
        total = u_extra + d_extra + unk[uid]
        if total:
            params.append({"uid": str(uid), "value": total})
        if u_part:
            up_out[uid] = u_part
        if d_part:
            dn_out[uid] = d_part
    return params, up_out, dn_out


def get_outbounds_stats(api: XRayAPI):
    try:
        params = [{"up": stat.value, "down": 0} if stat.link == "uplink" else {"up": 0, "down": stat.value}
                  for stat in filter(attrgetter('value'), api.get_outbounds_stats(reset=True, timeout=10))]
        return params
    except xray_exc.XrayError:
        return []


def enforce_node_traffic_limits(node_id: Union[int, None], params: list):
    if node_id is None or not params:
        return

    user_ids = [int(param["uid"]) for param in params]
    with GetDB() as db:
        exceeded_user_ids = crud.get_user_node_limit_exceeded_ids(db, node_id, user_ids)
        if not exceeded_user_ids:
            return
        users = [crud.get_user_by_id(db, user_id) for user_id in exceeded_user_ids]

    for dbuser in filter(None, users):
        xray.operations.remove_user_from_node(node_id, dbuser)
        logger.info(
            f'User "{dbuser.username}" reached traffic limit on node {node_id} and was removed from that node'
        )


def record_user_usages():
    api_instances = {None: xray.api}
    usage_coefficient = {None: 1}  # default usage coefficient for the main api instance

    for node_id, node in list(xray.nodes.items()):
        if node.connected and node.started:
            api_instances[node_id] = node.api
            usage_coefficient[node_id] = node.usage_coefficient  # fetch the usage coefficient

    api_params: Dict[Union[int, None], List[dict]] = {}
    user_speed_up: Dict[int, int] = defaultdict(int)
    user_speed_down: Dict[int, int] = defaultdict(int)
    user_node_contrib: Dict[Tuple[int, Union[int, None]], int] = defaultdict(int)

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            nid: executor.submit(
                _collect_user_stats_for_node,
                api,
                usage_coefficient.get(nid, 1),
            )
            for nid, api in api_instances.items()
        }
    for node_id, fut in futures.items():
        params, up_map, dn_map = fut.result()
        api_params[node_id] = params
        interval = max(1, JOB_RECORD_USER_USAGES_INTERVAL)
        for uid, v in up_map.items():
            user_speed_up[uid] += v // interval
        for uid, v in dn_map.items():
            user_speed_down[uid] += v // interval
        for p in params:
            uid = int(p["uid"])
            user_node_contrib[(uid, node_id)] += int(p["value"])

    user_total = defaultdict(int)
    for (uid, _nid), v in user_node_contrib.items():
        user_total[uid] += v

    all_uids = list(user_total.keys())
    if not all_uids:
        return

    with GetDB() as db:
        rows = (
            db.query(User.id, User.admin_id, User.is_trial)
            .filter(User.id.in_(all_uids))
            .all()
        )
        uid_to_admin = {r[0]: r[1] for r in rows}
        uid_is_trial = {r[0]: bool(r[2]) for r in rows}
        sys_row = crud.get_system_usage(db)
        trial_m = crud.subscription_metered_nodes(sys_row.trial_metered_node_ids)
        paid_m = crud.subscription_metered_nodes(sys_row.paid_metered_node_ids)

    user_row_delta = {}
    admin_usage = defaultdict(int)

    for uid, total in user_total.items():
        metered = trial_m if uid_is_trial.get(uid) else paid_m
        if metered:
            metered_sum = sum(
                v
                for (u, nid), v in user_node_contrib.items()
                if u == uid and nid in metered
            )
            user_row_delta[uid] = metered_sum
        else:
            user_row_delta[uid] = total

        aid = uid_to_admin.get(uid)
        if aid:
            admin_usage[aid] += total

    users_usage = [{"uid": uid, "value": user_row_delta[uid]} for uid in all_uids]
    users_total_delta = [{"uid": uid, "tval": int(user_total[uid])} for uid in all_uids]
    speed_rows = [
        {
            "uid": uid,
            "ul": int(user_speed_up.get(uid, 0)),
            "dl": int(user_speed_down.get(uid, 0)),
        }
        for uid in all_uids
    ]

    with GetDB() as db:
        stmt = update(User). \
            where(User.id == bindparam('uid')). \
            values(
                used_traffic=User.used_traffic + bindparam('value'),
                online_at=datetime.utcnow()
        )

        safe_execute(db, stmt, users_usage)

        stmt_total = (
            update(User)
            .where(User.id == bindparam("uid"))
            .values(used_traffic_total=User.used_traffic_total + bindparam("tval"))
        )
        safe_execute(db, stmt_total, users_total_delta)

        spd_stmt = (
            update(User)
            .where(User.id == bindparam("uid"))
            .values(
                sub_live_uplink_bps=bindparam("ul"),
                sub_live_downlink_bps=bindparam("dl"),
            )
        )
        safe_execute(db, spd_stmt, speed_rows)

        admin_data = [{"admin_id": admin_id, "value": value} for admin_id, value in admin_usage.items()]
        if admin_data:
            admin_update_stmt = update(Admin). \
                where(Admin.id == bindparam('admin_id')). \
                values(users_usage=Admin.users_usage + bindparam('value'))
            safe_execute(db, admin_update_stmt, admin_data)

    if DISABLE_RECORDING_NODE_USAGE:
        return

    for node_id, params in api_params.items():
        record_user_stats(params, node_id, usage_coefficient[node_id])
        enforce_node_traffic_limits(node_id, params)


def record_node_usages():
    api_instances = {None: xray.api}
    for node_id, node in list(xray.nodes.items()):
        if node.connected and node.started:
            api_instances[node_id] = node.api

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {node_id: executor.submit(get_outbounds_stats, api) for node_id, api in api_instances.items()}
    api_params = {node_id: future.result() for node_id, future in futures.items()}

    total_up = 0
    total_down = 0
    for node_id, params in api_params.items():
        for param in params:
            total_up += param['up']
            total_down += param['down']
    if not (total_up or total_down):
        return

    # record nodes usage
    with GetDB() as db:
        stmt = update(System).values(
            uplink=System.uplink + total_up,
            downlink=System.downlink + total_down
        )
        safe_execute(db, stmt)

    if DISABLE_RECORDING_NODE_USAGE:
        return

    for node_id, params in api_params.items():
        record_node_stats(params, node_id)


scheduler.add_job(record_user_usages, 'interval',
                  seconds=JOB_RECORD_USER_USAGES_INTERVAL,
                  coalesce=True, max_instances=1)
scheduler.add_job(record_node_usages, 'interval',
                  seconds=JOB_RECORD_NODE_USAGES_INTERVAL,
                  coalesce=True, max_instances=1)
