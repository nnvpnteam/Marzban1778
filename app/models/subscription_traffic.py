from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _normalize_metered_list(v):
    if v is None:
        return None
    if not isinstance(v, list):
        raise ValueError("expected list")
    out: List[Optional[int]] = []
    for item in v:
        if item is None:
            out.append(None)
        elif isinstance(item, int):
            out.append(item)
        elif isinstance(item, float):
            out.append(int(item))
        elif isinstance(item, str) and item.isdigit():
            out.append(int(item))
        else:
            raise ValueError("node id must be int or null")
    return out


class SubscriptionTrafficSettings(BaseModel):
    trial_metered_node_ids: List[Optional[int]] = Field(
        default_factory=list,
        description="Node ids counting toward user data_limit for trial users; null = main core",
    )
    paid_metered_node_ids: List[Optional[int]] = Field(
        default_factory=list,
        description="Node ids counting toward user data_limit for paid users; null = main core",
    )

    @field_validator("trial_metered_node_ids", "paid_metered_node_ids", mode="before")
    @classmethod
    def normalize_ids(cls, v):
        if v is None:
            return []
        r = _normalize_metered_list(v)
        return r if r is not None else []


class SubscriptionTrafficSettingsModify(BaseModel):
    trial_metered_node_ids: Optional[List[Optional[int]]] = None
    paid_metered_node_ids: Optional[List[Optional[int]]] = None

    @field_validator("trial_metered_node_ids", "paid_metered_node_ids", mode="before")
    @classmethod
    def normalize_modify(cls, v):
        return _normalize_metered_list(v)


class SubscriptionTrafficSettingsResponse(SubscriptionTrafficSettings):
    model_config = ConfigDict(from_attributes=True)
