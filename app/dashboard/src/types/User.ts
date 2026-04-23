export type Status =
  | "active"
  | "disabled"
  | "limited"
  | "expired"
  | "on_hold"
  | "error"
  | "connecting"
  | "connected";
export type ProxyKeys = ("vmess" | "vless" | "trojan" | "shadowsocks")[];
export type ProxyType = {
  vmess?: {
    id?: string;
  };
  vless?: {
    id?: string;
    flow?: string;
  };
  trojan?: {
    password?: string;
  };
  shadowsocks?: {
    password?: string;
    method?: string;
  };
};

export type DataLimitResetStrategy =
  | "no_reset"
  | "day"
  | "week"
  | "month"
  | "year";

export type UserInbounds = {
  [key: string]: string[];
};

export type UserHWIDDevice = {
  device_id: string;
  user_agent?: string | null;
  created_at: string;
  last_seen_at: string;
};

export type User = {
  proxies: ProxyType;
  expire: number | null;
  data_limit: number | null;
  data_limit_reset_strategy: DataLimitResetStrategy;
  on_hold_expire_duration: number | null;
  hwid_device_limit: number | null;
  effective_hwid_device_limit?: number | null;
  node_data_limits?: Record<string, number>;
  hwid_devices?: UserHWIDDevice[];
  lifetime_used_traffic: number;
  username: string;
  used_traffic: number;
  is_trial: boolean;
  sub_live_uplink_bps: number;
  sub_live_downlink_bps: number;
  status: Status;
  links: string[];
  subscription_url: string;
  inbounds: UserInbounds;
  note: string;
  online_at: string;
};

export type UserCreate = Pick<
  User,
  | "inbounds"
  | "proxies"
  | "expire"
  | "data_limit"
  | "data_limit_reset_strategy"
  | "hwid_device_limit"
  | "node_data_limits"
  | "on_hold_expire_duration"
  | "username"
  | "status"
  | "note"
  | "is_trial"
>;

export type UserApi = {
  discord_webook: string;
  is_sudo: boolean;
  telegram_id: number | string;
  username: string;
}

export type UseGetUserReturn = {
  userData: UserApi;
  getUserIsPending: boolean;
  getUserIsSuccess: boolean;
  getUserIsError: boolean;
  getUserError: Error | null;
}
