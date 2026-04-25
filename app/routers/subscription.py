import re
from distutils.version import LooseVersion

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Request, Response
from fastapi.responses import HTMLResponse

from app.db import Session, crud, get_db
from app.dependencies import get_validated_sub, validate_dates
from app.models.user import SubscriptionUserResponse, UserResponse
from app.subscription.share import encode_title, generate_subscription
from app.templates import render_template
from config import (
    HWID_HEADER_NAMES,
    SUB_PROFILE_TITLE,
    SUB_SUPPORT_URL,
    SUB_UPDATE_INTERVAL,
    SUBSCRIPTION_PAGE_TEMPLATE,
    USE_CUSTOM_JSON_DEFAULT,
    USE_CUSTOM_JSON_FOR_HAPP,
    USE_CUSTOM_JSON_FOR_STREISAND,
    USE_CUSTOM_JSON_FOR_V2RAYN,
    USE_CUSTOM_JSON_FOR_V2RAYNG,
    XRAY_SUBSCRIPTION_PATH,
)

client_config = {
    "clash-meta": {"config_format": "clash-meta", "media_type": "text/yaml", "as_base64": False, "reverse": False},
    "sing-box": {"config_format": "sing-box", "media_type": "application/json", "as_base64": False, "reverse": False},
    "clash": {"config_format": "clash", "media_type": "text/yaml", "as_base64": False, "reverse": False},
    "v2ray": {"config_format": "v2ray", "media_type": "text/plain", "as_base64": True, "reverse": False},
    "outline": {"config_format": "outline", "media_type": "application/json", "as_base64": False, "reverse": False},
    "v2ray-json": {"config_format": "v2ray-json", "media_type": "application/json", "as_base64": False,
                   "reverse": False}
}

router = APIRouter(tags=['Subscription'], prefix=f'/{XRAY_SUBSCRIPTION_PATH}')


def resolve_hwid(request: Request, user_agent: str) -> str | None:
    raw_device_id = None
    for header_name in HWID_HEADER_NAMES:
        value = request.headers.get(header_name)
        if value:
            raw_device_id = value
            break

    if not raw_device_id:
        raw_device_id = (
            request.query_params.get("hwid")
            or request.query_params.get("device_id")
        )
    if raw_device_id:
        return raw_device_id.strip()[:255]
    return None


def resolve_device_context(request: Request) -> str:
    """
    Build compact device context from optional headers/query params so dashboard
    can show a more specific device name even when User-Agent is generic.
    """
    hints: dict[str, str] = {}
    for key in (
        "x-device-model",
        "x-device-name",
        "x-device-brand",
        "x-device-manufacturer",
        "x-device-platform",
        "x-os-name",
        "x-client-device",
        "sec-ch-ua-model",
        "sec-ch-ua-platform",
    ):
        value = request.headers.get(key)
        if value:
            hints[key] = value.strip().strip('"')

    for qk in (
        "device_model",
        "device_name",
        "device_brand",
        "device_platform",
        "platform",
        "os",
        "model",
        "brand",
    ):
        qv = request.query_params.get(qk)
        if qv:
            hints[qk] = qv.strip()

    if not hints:
        return ""

    parts = [f"{k}={v}" for k, v in hints.items() if v]
    if not parts:
        return ""
    return " | " + ";".join(parts)


def build_device_user_agent(user_agent: str, request: Request) -> str:
    ua = (user_agent or "").strip()
    ctx = resolve_device_context(request)
    # Keep DB field safe (user_hwid_devices.user_agent is String(512)).
    merged = (ua + ctx).strip() if ctx else ua
    return merged[:512]


def _first_nonempty(*values: str | None) -> str | None:
    for v in values:
        if v and v.strip():
            return v.strip().strip('"')
    return None


def resolve_device_details(request: Request, user_agent: str) -> dict[str, str | None]:
    platform = _first_nonempty(
        request.headers.get("x-device-os"),
        request.headers.get("x-device-platform"),
        request.headers.get("x-os-name"),
        request.headers.get("sec-ch-ua-platform"),
        request.query_params.get("device_os"),
        request.query_params.get("device_platform"),
        request.query_params.get("platform"),
        request.query_params.get("os"),
    )
    os_version = _first_nonempty(
        request.headers.get("x-ver-os"),
        request.headers.get("x-os-version"),
        request.query_params.get("os_version"),
        request.query_params.get("ver_os"),
    )
    device_model = _first_nonempty(
        request.headers.get("x-device-model"),
        request.headers.get("x-device-name"),
        request.query_params.get("device_model"),
        request.query_params.get("device_name"),
        request.query_params.get("model"),
    )

    if not platform and user_agent:
        low = user_agent.lower()
        if "android" in low:
            platform = "Android"
        elif "iphone" in low or "ipad" in low or "ios" in low:
            platform = "iOS"
        elif "windows" in low:
            platform = "Windows"
        elif "macintosh" in low or "mac os" in low:
            platform = "macOS"
        elif "linux" in low or "x11" in low:
            platform = "Linux"

    return {
        "platform": (platform or "")[:32] or None,
        "os_version": (os_version or "")[:64] or None,
        "device_model": (device_model or "")[:128] or None,
    }


def get_subscription_user_info(user: UserResponse) -> dict:
    """Retrieve user subscription information including upload, download, total data, and expiry."""
    return {
        "upload": 0,
        "download": user.used_traffic,
        "total": user.data_limit if user.data_limit is not None else 0,
        "expire": user.expire if user.expire is not None else 0,
    }


@router.get("/{token}/")
@router.get("/{token}", include_in_schema=False)
def user_subscription(
    request: Request,
    db: Session = Depends(get_db),
    dbuser: UserResponse = Depends(get_validated_sub),
    user_agent: str = Header(default="")
):
    """Provides a subscription link based on the user agent (Clash, V2Ray, etc.)."""
    user: UserResponse = UserResponse.model_validate(dbuser)

    accept_header = request.headers.get("Accept", "")
    if "text/html" in accept_header:
        return HTMLResponse(
            render_template(
                SUBSCRIPTION_PAGE_TEMPLATE,
                {"user": user}
            )
        )

    device_ua = build_device_user_agent(user_agent, request)
    device_details = resolve_device_details(request, device_ua)
    device_id = resolve_hwid(request, device_ua)
    if device_id:
        try:
            crud.register_user_hwid(
                db,
                dbuser,
                device_id,
                device_ua,
                platform=device_details["platform"],
                os_version=device_details["os_version"],
                device_model=device_details["device_model"],
            )
        except ValueError:
            raise HTTPException(status_code=403, detail="HWID device limit reached")

    crud.update_user_sub(db, dbuser, device_ua)
    response_headers = {
        "content-disposition": f'attachment; filename="{user.username}"',
        "profile-web-page-url": str(request.url),
        "support-url": SUB_SUPPORT_URL,
        "profile-title": encode_title(SUB_PROFILE_TITLE),
        "profile-update-interval": SUB_UPDATE_INTERVAL,
        "subscription-userinfo": "; ".join(
            f"{key}={val}"
            for key, val in get_subscription_user_info(user).items()
        )
    }

    if re.match(r'^([Cc]lash-verge|[Cc]lash[-\.]?[Mm]eta|[Ff][Ll][Cc]lash|[Mm]ihomo)', user_agent):
        conf = generate_subscription(user=user, config_format="clash-meta", as_base64=False, reverse=False)
        return Response(content=conf, media_type="text/yaml", headers=response_headers)

    elif re.match(r'^([Cc]lash|[Ss]tash)', user_agent):
        conf = generate_subscription(user=user, config_format="clash", as_base64=False, reverse=False)
        return Response(content=conf, media_type="text/yaml", headers=response_headers)

    elif re.match(r'^(SFA|SFI|SFM|SFT|[Kk]aring|[Hh]iddify[Nn]ext)', user_agent):
        conf = generate_subscription(user=user, config_format="sing-box", as_base64=False, reverse=False)
        return Response(content=conf, media_type="application/json", headers=response_headers)

    elif re.match(r'^(SS|SSR|SSD|SSS|Outline|Shadowsocks|SSconf)', user_agent):
        conf = generate_subscription(user=user, config_format="outline", as_base64=False, reverse=False)
        return Response(content=conf, media_type="application/json", headers=response_headers)

    elif (USE_CUSTOM_JSON_DEFAULT or USE_CUSTOM_JSON_FOR_V2RAYN) and re.match(r'^v2rayN/(\d+\.\d+)', user_agent):
        version_str = re.match(r'^v2rayN/(\d+\.\d+)', user_agent).group(1)
        if LooseVersion(version_str) >= LooseVersion("6.40"):
            conf = generate_subscription(user=user, config_format="v2ray-json", as_base64=False, reverse=False)
            return Response(content=conf, media_type="application/json", headers=response_headers)
        else:
            conf = generate_subscription(user=user, config_format="v2ray", as_base64=True, reverse=False)
            return Response(content=conf, media_type="text/plain", headers=response_headers)

    elif (USE_CUSTOM_JSON_DEFAULT or USE_CUSTOM_JSON_FOR_V2RAYNG) and re.match(r'^v2rayNG/(\d+\.\d+\.\d+)', user_agent):
        version_str = re.match(r'^v2rayNG/(\d+\.\d+\.\d+)', user_agent).group(1)
        if LooseVersion(version_str) >= LooseVersion("1.8.29"):
            conf = generate_subscription(user=user, config_format="v2ray-json", as_base64=False, reverse=False)
            return Response(content=conf, media_type="application/json", headers=response_headers)
        elif LooseVersion(version_str) >= LooseVersion("1.8.18"):
            conf = generate_subscription(user=user, config_format="v2ray-json", as_base64=False, reverse=True)
            return Response(content=conf, media_type="application/json", headers=response_headers)
        else:
            conf = generate_subscription(user=user, config_format="v2ray", as_base64=True, reverse=False)
            return Response(content=conf, media_type="text/plain", headers=response_headers)

    elif re.match(r'^[Ss]treisand', user_agent):
        if USE_CUSTOM_JSON_DEFAULT or USE_CUSTOM_JSON_FOR_STREISAND:
            conf = generate_subscription(user=user, config_format="v2ray-json", as_base64=False, reverse=False)
            return Response(content=conf, media_type="application/json", headers=response_headers)
        else:
            conf = generate_subscription(user=user, config_format="v2ray", as_base64=True, reverse=False)
            return Response(content=conf, media_type="text/plain", headers=response_headers)

    elif (USE_CUSTOM_JSON_DEFAULT or USE_CUSTOM_JSON_FOR_HAPP) and re.match(r'^Happ/(\d+\.\d+\.\d+)', user_agent):
        version_str = re.match(r'^Happ/(\d+\.\d+\.\d+)', user_agent).group(1)
        if LooseVersion(version_str) >= LooseVersion("1.63.1"):
            conf = generate_subscription(user=user, config_format="v2ray-json", as_base64=False, reverse=False)
            return Response(content=conf, media_type="application/json", headers=response_headers)
        else:
            conf = generate_subscription(user=user, config_format="v2ray", as_base64=True, reverse=False)
            return Response(content=conf, media_type="text/plain", headers=response_headers)



    else:
        conf = generate_subscription(user=user, config_format="v2ray", as_base64=True, reverse=False)
        return Response(content=conf, media_type="text/plain", headers=response_headers)


@router.get("/{token}/info", response_model=SubscriptionUserResponse)
def user_subscription_info(
    dbuser: UserResponse = Depends(get_validated_sub),
):
    """Retrieves detailed information about the user's subscription."""
    return dbuser


@router.get("/{token}/usage")
def user_get_usage(
    dbuser: UserResponse = Depends(get_validated_sub),
    start: str = "",
    end: str = "",
    db: Session = Depends(get_db)
):
    """Fetches the usage statistics for the user within a specified date range."""
    start, end = validate_dates(start, end)

    usages = crud.get_user_usages(db, dbuser, start, end)

    return {"usages": usages, "username": dbuser.username}


@router.get("/{token}/{client_type}")
def user_subscription_with_client_type(
    request: Request,
    dbuser: UserResponse = Depends(get_validated_sub),
    client_type: str = Path(..., regex="sing-box|clash-meta|clash|outline|v2ray|v2ray-json"),
    db: Session = Depends(get_db),
    user_agent: str = Header(default="")
):
    """Provides a subscription link based on the specified client type (e.g., Clash, V2Ray)."""
    user: UserResponse = UserResponse.model_validate(dbuser)

    response_headers = {
        "content-disposition": f'attachment; filename="{user.username}"',
        "profile-web-page-url": str(request.url),
        "support-url": SUB_SUPPORT_URL,
        "profile-title": encode_title(SUB_PROFILE_TITLE),
        "profile-update-interval": SUB_UPDATE_INTERVAL,
        "subscription-userinfo": "; ".join(
            f"{key}={val}"
            for key, val in get_subscription_user_info(user).items()
        )
    }

    config = client_config.get(client_type)
    device_ua = build_device_user_agent(user_agent, request)
    device_details = resolve_device_details(request, device_ua)
    device_id = resolve_hwid(request, device_ua)
    if device_id:
        try:
            crud.register_user_hwid(
                db,
                dbuser,
                device_id,
                device_ua,
                platform=device_details["platform"],
                os_version=device_details["os_version"],
                device_model=device_details["device_model"],
            )
        except ValueError:
            raise HTTPException(status_code=403, detail="HWID device limit reached")

    crud.update_user_sub(db, dbuser, device_ua)
    conf = generate_subscription(user=user,
                                 config_format=config["config_format"],
                                 as_base64=config["as_base64"],
                                 reverse=config["reverse"])

    return Response(content=conf, media_type=config["media_type"], headers=response_headers)
