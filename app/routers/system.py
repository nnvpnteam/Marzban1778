from typing import Dict, List, Union

from fastapi import APIRouter, Depends, HTTPException

from app import __version__, xray
from app.db import Session, crud, get_db
from app.models.admin import Admin
from app.models.proxy import ProxyHost, ProxyInbound, ProxyTypes
from app.models.subscription_traffic import (
    SubscriptionTrafficGroupBulk,
    SubscriptionTrafficGroupBulkResult,
    SubscriptionTrafficSettingsModify,
    SubscriptionTrafficSettingsResponse,
)
from app.models.system import SystemStats
from app.models.user import UserStatus
from app.utils import responses
from app.utils.system import cpu_usage, memory_usage, realtime_bandwidth

router = APIRouter(tags=["System"], prefix="/api", responses={401: responses._401})


@router.get("/system", response_model=SystemStats)
def get_system_stats(
    db: Session = Depends(get_db), admin: Admin = Depends(Admin.get_current)
):
    """Fetch system stats including memory, CPU, and user metrics."""
    mem = memory_usage()
    cpu = cpu_usage()
    system = crud.get_system_usage(db)
    dbadmin: Union[Admin, None] = crud.get_admin(db, admin.username)

    total_user = crud.get_users_count(db, admin=dbadmin if not admin.is_sudo else None)
    paid_users = crud.get_users_count(
        db,
        admin=dbadmin if not admin.is_sudo else None,
        is_trial=False,
    )
    users_active = crud.get_users_count(
        db, status=UserStatus.active, admin=dbadmin if not admin.is_sudo else None
    )
    users_disabled = crud.get_users_count(
        db, status=UserStatus.disabled, admin=dbadmin if not admin.is_sudo else None
    )
    users_on_hold = crud.get_users_count(
        db, status=UserStatus.on_hold, admin=dbadmin if not admin.is_sudo else None
    )
    users_expired = crud.get_users_count(
        db, status=UserStatus.expired, admin=dbadmin if not admin.is_sudo else None
    )
    users_limited = crud.get_users_count(
        db, status=UserStatus.limited, admin=dbadmin if not admin.is_sudo else None
    )
    online_users = crud.count_online_users(
        db, 2, admin=dbadmin if not admin.is_sudo else None
    )
    realtime_bandwidth_stats = realtime_bandwidth()

    return SystemStats(
        version=__version__,
        mem_total=mem.total,
        mem_used=mem.used,
        cpu_cores=cpu.cores,
        cpu_usage=cpu.percent,
        total_user=total_user,
        paid_users=paid_users,
        online_users=online_users,
        users_active=users_active,
        users_disabled=users_disabled,
        users_expired=users_expired,
        users_limited=users_limited,
        users_on_hold=users_on_hold,
        incoming_bandwidth=system.uplink,
        outgoing_bandwidth=system.downlink,
        incoming_bandwidth_speed=realtime_bandwidth_stats.incoming_bytes,
        outgoing_bandwidth_speed=realtime_bandwidth_stats.outgoing_bytes,
    )


@router.get(
    "/subscription_traffic_settings",
    response_model=SubscriptionTrafficSettingsResponse,
)
def get_subscription_traffic_settings(
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.get_current),
):
    """Metered node pools for trial vs paid subscriptions (global)."""
    _ = admin
    return crud.get_subscription_traffic_settings(db)


@router.put(
    "/subscription_traffic_settings",
    response_model=SubscriptionTrafficSettingsResponse,
    responses={403: responses._403},
)
def put_subscription_traffic_settings(
    payload: SubscriptionTrafficSettingsModify,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Update metered node pools (sudo only)."""
    _ = admin
    return crud.update_subscription_traffic_settings(db, payload)


@router.post(
    "/subscription_traffic_group_bulk",
    response_model=SubscriptionTrafficGroupBulkResult,
    responses={400: responses._400, 403: responses._403},
)
def post_subscription_traffic_group_bulk(
    payload: SubscriptionTrafficGroupBulk,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """
    Bulk add/remove calendar days on expire and/or GiB on data_limit for all users
    in the trial or paid subscription group. Unlimited users (null data_limit) are
    unchanged for the limit field; users without expire are unchanged for dates.
    """
    _ = admin
    is_trial = payload.group == "trial"
    bytes_delta = None
    if payload.add_data_limit_gb is not None and payload.add_data_limit_gb != 0:
        bytes_delta = int(round(float(payload.add_data_limit_gb) * 1024 * 1024 * 1024))
    n = crud.bulk_adjust_subscription_group_users(
        db,
        is_trial=is_trial,
        add_expire_days=payload.add_expire_days,
        add_data_limit_bytes=bytes_delta,
    )
    return SubscriptionTrafficGroupBulkResult(matched_users=n)


@router.get("/inbounds", response_model=Dict[ProxyTypes, List[ProxyInbound]])
def get_inbounds(admin: Admin = Depends(Admin.get_current)):
    """Retrieve inbound configurations grouped by protocol."""
    return xray.config.inbounds_by_protocol


@router.get(
    "/hosts", response_model=Dict[str, List[ProxyHost]], responses={403: responses._403}
)
def get_hosts(
    db: Session = Depends(get_db), admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Get a list of proxy hosts grouped by inbound tag."""
    hosts = {tag: crud.get_hosts(db, tag) for tag in xray.config.inbounds_by_tag}
    return hosts


@router.put(
    "/hosts", response_model=Dict[str, List[ProxyHost]], responses={403: responses._403}
)
def modify_hosts(
    modified_hosts: Dict[str, List[ProxyHost]],
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Modify proxy hosts and update the configuration."""
    for inbound_tag in modified_hosts:
        if inbound_tag not in xray.config.inbounds_by_tag:
            raise HTTPException(
                status_code=400, detail=f"Inbound {inbound_tag} doesn't exist"
            )

    for inbound_tag, hosts in modified_hosts.items():
        crud.update_hosts(db, inbound_tag, hosts)

    xray.hosts.update()

    return {tag: crud.get_hosts(db, tag) for tag in xray.config.inbounds_by_tag}
