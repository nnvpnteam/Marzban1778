import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Collapse,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Grid,
  GridItem,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Spinner,
  Switch,
  Text,
  Textarea,
  Tooltip,
  VStack,
  chakra,
  useColorMode,
  useToast,
} from "@chakra-ui/react";
import {
  ChartPieIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  PencilIcon,
  QuestionMarkCircleIcon,
  TrashIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetStrategy } from "constants/UserSettings";
import { FilterUsageType, useDashboard } from "contexts/DashboardContext";
import dayjs from "dayjs";
import { FC, useEffect, useState } from "react";
import ReactApexChart from "react-apexcharts";
import ReactDatePicker from "react-datepicker";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  ProxyKeys,
  ProxyType,
  User,
  UserCreate,
  UserInbounds,
} from "types/User";
import { relativeExpiryDate } from "utils/dateFormatter";
import { z } from "zod";
import { DeleteIcon } from "./DeleteUserModal";
import { Icon } from "./Icon";
import { Input } from "./Input";
import { RadioGroup } from "./RadioGroup";
import { UsageFilter, createUsageConfig } from "./UsageFilter";
import { ReloadIcon } from "./Filters";
import classNames from "classnames";

const AddUserIcon = chakra(UserPlusIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

const EditUserIcon = chakra(PencilIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

const UserUsageIcon = chakra(ChartPieIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

const DevicePhoneIcon = chakra(DevicePhoneMobileIcon, {
  baseStyle: { w: 4, h: 4 },
});

const DeviceDesktopIcon = chakra(ComputerDesktopIcon, {
  baseStyle: { w: 4, h: 4 },
});

const DeviceUnknownIcon = chakra(QuestionMarkCircleIcon, {
  baseStyle: { w: 4, h: 4 },
});

const DeviceRemoveIcon = chakra(TrashIcon, {
  baseStyle: { w: 4, h: 4 },
});

type DeviceVisualMeta = {
  platform: "iphone" | "android" | "desktop" | "unknown";
  appName: string;
  /** Short label for the colored badge, e.g. iOS / Android / macOS */
  platformBadge: string;
  /** Second line: specific hardware / OS detail parsed from UA */
  deviceDetail: string;
  colorScheme: "orange" | "green" | "blue" | "gray";
};

const IOS_MODEL_MAP: Record<string, string> = {
  "iPhone17,1": "iPhone 16 Pro",
  "iPhone17,2": "iPhone 16 Pro Max",
  "iPhone17,3": "iPhone 16",
  "iPhone17,4": "iPhone 16 Plus",
  "iPhone16,1": "iPhone 15 Pro",
  "iPhone16,2": "iPhone 15 Pro Max",
  "iPhone16,3": "iPhone 15",
  "iPhone16,4": "iPhone 15 Plus",
  "iPhone15,4": "iPhone 14",
  "iPhone15,5": "iPhone 14 Plus",
  "iPhone15,2": "iPhone 14 Pro",
  "iPhone15,3": "iPhone 14 Pro Max",
  "iPhone14,7": "iPhone 14",
  "iPhone14,8": "iPhone 14 Plus",
  "iPhone14,2": "iPhone 13 Pro",
  "iPhone14,3": "iPhone 13 Pro Max",
  "iPhone14,4": "iPhone 13 mini",
  "iPhone14,5": "iPhone 13",
  "iPhone13,1": "iPhone 12 mini",
  "iPhone13,2": "iPhone 12",
  "iPhone13,3": "iPhone 12 Pro",
  "iPhone13,4": "iPhone 12 Pro Max",
};

const pickIosVersion = (ua: string): string | null => {
  const m =
    ua.match(/iOS\s+([\d.]+)/i) ||
    ua.match(/iPhone\s+OS\s+([\d_]+)/i) ||
    ua.match(/CPU\s+OS\s+([\d_]+)/i);
  if (!m) return null;
  return m[1].replace(/_/g, ".");
};

const pickAndroidModel = (ua: string): string | null => {
  const m = ua.match(/Android\s+[\d.]+;\s*([^)]+)\)/i);
  if (!m) return null;
  let s = m[1].trim();
  s = s.replace(/\s+Build\/.*$/i, "").replace(/;\s*wv\)$/i, "").trim();
  if (s.length > 80) s = `${s.slice(0, 77)}…`;
  return s || null;
};

const pickDesktopDetail = (ua: string): string => {
  const mac = ua.match(/Mac\s+OS\s+X\s+([\d_]+)/i);
  if (mac) return `Mac · macOS ${mac[1].replace(/_/g, ".")}`;
  const win = ua.match(/Windows\s+NT\s+([\d.]+)/i);
  if (win) {
    const v = win[1];
    if (v === "10.0") return "PC · Windows 10/11";
    return `PC · Windows NT ${v}`;
  }
  if (/Linux/i.test(ua)) return "PC · Linux";
  return "Desktop";
};

const getDeviceVisualMeta = (userAgent?: string | null): DeviceVisualMeta => {
  const ua = userAgent || "";
  const raw = ua.toLowerCase();
  const appName =
    ua.split("/")[0]?.trim() ||
    ua.split(/\s+/)[0]?.trim() ||
    "Unknown app";

  if (raw.includes("iphone") || raw.includes("ios") || raw.includes("ipad")) {
    const isPad = raw.includes("ipad");
    const platformBadge = isPad ? "iPadOS" : "iOS";
    const hw = ua.match(/\b(iPhone\d+,\d+|iPad\d+,\d+|iPod\d+,\d+)\b/i);
    const iosVer = pickIosVersion(ua);
    let deviceDetail: string;
    if (hw) {
      const code = hw[1];
      const friendly = IOS_MODEL_MAP[code] || code.replace(/,/g, ",");
      deviceDetail = iosVer ? `${friendly} · iOS ${iosVer}` : friendly;
    } else if (iosVer) {
      deviceDetail = `${isPad ? "iPad" : "iPhone"} · iOS ${iosVer}`;
    } else {
      deviceDetail = isPad ? "iPad" : "iPhone";
    }
    return {
      platform: "iphone",
      appName,
      platformBadge,
      deviceDetail,
      colorScheme: "orange",
    };
  }
  if (raw.includes("android")) {
    const model = pickAndroidModel(ua);
    const ver = ua.match(/Android\s+([\d.]+)/i)?.[1];
    const deviceDetail =
      model && ver
        ? `${model} · Android ${ver}`
        : model || (ver ? `Android ${ver}` : "Android device");
    return {
      platform: "android",
      appName,
      platformBadge: "Android",
      deviceDetail,
      colorScheme: "green",
    };
  }
  if (
    raw.includes("windows") ||
    raw.includes("macintosh") ||
    raw.includes("linux") ||
    raw.includes("x11")
  ) {
    return {
      platform: "desktop",
      appName,
      platformBadge: raw.includes("macintosh") ? "macOS" : raw.includes("windows") ? "Windows" : "Linux",
      deviceDetail: pickDesktopDetail(ua),
      colorScheme: "blue",
    };
  }
  return {
    platform: "unknown",
    appName,
    platformBadge: "Unknown",
    deviceDetail: ua.length > 120 ? `${ua.slice(0, 117)}…` : ua || "Unknown device",
    colorScheme: "gray",
  };
};

const getDeviceIcon = (platform: DeviceVisualMeta["platform"]) => {
  if (platform === "desktop") return <DeviceDesktopIcon />;
  if (platform === "iphone" || platform === "android") return <DevicePhoneIcon />;
  return <DeviceUnknownIcon />;
};

export type UserDialogProps = {};

export type FormType = Pick<UserCreate, keyof UserCreate> & {
  selected_proxies: ProxyKeys;
};

const formatUser = (user: User): FormType => {
  const nodeDataLimits = Object.fromEntries(
    Object.entries(user.node_data_limits || {}).map(([nodeId, value]) => [
      nodeId,
      Number((value / 1073741824).toFixed(5)),
    ])
  );
  return {
    ...user,
    data_limit: user.data_limit
      ? Number((user.data_limit / 1073741824).toFixed(5))
      : user.data_limit,
    on_hold_expire_duration: user.on_hold_expire_duration
      ? Number(user.on_hold_expire_duration / (24 * 60 * 60))
      : user.on_hold_expire_duration,
    hwid_device_limit: user.hwid_device_limit,
    node_data_limits: nodeDataLimits,
    selected_proxies: Object.keys(user.proxies) as ProxyKeys,
  };
};
const getDefaultValues = (): FormType => {
  const defaultInbounds = Object.fromEntries(useDashboard.getState().inbounds);
  const inbounds: UserInbounds = {};
  for (const key in defaultInbounds) {
    inbounds[key] = defaultInbounds[key].map((i) => i.tag);
  }
  return {
    selected_proxies: Object.keys(defaultInbounds) as ProxyKeys,
    data_limit: null,
    expire: null,
    hwid_device_limit: null,
    username: "",
    data_limit_reset_strategy: "no_reset",
    status: "active",
    on_hold_expire_duration: null,
    note: "",
    node_data_limits: {},
    inbounds,
    proxies: {
      vless: { id: "", flow: "" },
      vmess: { id: "" },
      trojan: { password: "" },
      shadowsocks: { password: "", method: "chacha20-ietf-poly1305" },
    },
  };
};

const mergeProxies = (
  proxyKeys: ProxyKeys,
  proxyType: ProxyType | undefined
): ProxyType => {
  const proxies: ProxyType = proxyKeys.reduce(
    (ac, a) => ({ ...ac, [a]: {} }),
    {}
  );
  if (!proxyType) return proxies;
  proxyKeys.forEach((proxy) => {
    if (proxyType[proxy]) {
      proxies[proxy] = proxyType[proxy];
    }
  });
  return proxies;
};

const baseSchema = {
  username: z.string().min(1, { message: "Required" }),
  selected_proxies: z.array(z.string()).refine((value) => value.length > 0, {
    message: "userDialog.selectOneProtocol",
  }),
  note: z.string().nullable(),
  proxies: z
    .record(z.string(), z.record(z.string(), z.any()))
    .transform((ins) => {
      const deleteIfEmpty = (obj: any, key: string) => {
        if (obj && obj[key] === "") {
          delete obj[key];
        }
      };
      deleteIfEmpty(ins.vmess, "id");
      deleteIfEmpty(ins.vless, "id");
      deleteIfEmpty(ins.trojan, "password");
      deleteIfEmpty(ins.shadowsocks, "password");
      deleteIfEmpty(ins.shadowsocks, "method");
      return ins;
    }),
  data_limit: z
    .string()
    .min(0)
    .or(z.number())
    .nullable()
    .transform((str) => {
      if (str) return Number((parseFloat(String(str)) * 1073741824).toFixed(5));
      return 0;
    }),
  hwid_device_limit: z
    .string()
    .or(z.number())
    .nullable()
    .transform((value) => {
      if (value === null || value === "") return null;
      return Math.max(0, parseInt(String(value), 10) || 0);
    }),
  expire: z.number().nullable(),
  data_limit_reset_strategy: z.string(),
  node_data_limits: z
    .record(z.string(), z.string().or(z.number()).nullable())
    .transform((limits) => {
      const normalized: Record<string, number> = {};
      Object.entries(limits || {}).forEach(([nodeId, value]) => {
        if (value === null || value === "") return;
        const parsed = Number(value);
        if (parsed > 0) {
          normalized[nodeId] = Number((parsed * 1073741824).toFixed(5));
        }
      });
      return normalized;
    }),
  inbounds: z.record(z.string(), z.array(z.string())).transform((ins) => {
    Object.keys(ins).forEach((protocol) => {
      if (Array.isArray(ins[protocol]) && !ins[protocol]?.length)
        delete ins[protocol];
    });
    return ins;
  }),
};

const schema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("active"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("disabled"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("limited"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("expired"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("on_hold"),
    on_hold_expire_duration: z.coerce
      .number()
      .min(0.1, "Required")
      .transform((d) => {
        return d * (24 * 60 * 60);
      }),
    ...baseSchema,
  }),
]);

export const UserDialog: FC<UserDialogProps> = () => {
  const {
    editingUser,
    isCreatingNewUser,
    onCreateUser,
    editUser,
    fetchUserUsage,
    onEditingUser,
    createUser,
    onDeletingUser,
    removeUserDevice,
  } = useDashboard();
  const isEditing = !!editingUser;
  const isOpen = isCreatingNewUser || isEditing;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>("");
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const { colorMode } = useColorMode();

  const [usageVisible, setUsageVisible] = useState(false);
  const [deletingDeviceId, setDeletingDeviceId] = useState<string | null>(null);
  const handleUsageToggle = () => {
    setUsageVisible((current) => !current);
  };

  const form = useForm<FormType>({
    defaultValues: getDefaultValues(),
    resolver: zodResolver(schema),
  });

  useEffect(
    () =>
      useDashboard.subscribe(
        (state) => state.inbounds,
        () => {
          form.reset(getDefaultValues());
        }
      ),
    []
  );

  const [dataLimit, userStatus] = useWatch({
    control: form.control,
    name: ["data_limit", "status"],
  });

  const usageTitle = t("userDialog.total");
  const [usage, setUsage] = useState(createUsageConfig(colorMode, usageTitle));
  const [usageFilter, setUsageFilter] = useState("1m");
  const fetchUsageWithFilter = (query: FilterUsageType) => {
    fetchUserUsage(editingUser!, query).then((data: any) => {
      const labels = [];
      const series = [];
      for (const key in data.usages) {
        series.push(data.usages[key].used_traffic);
        labels.push(data.usages[key].node_name);
      }
      setUsage(createUsageConfig(colorMode, usageTitle, series, labels));
    });
  };

  useEffect(() => {
    if (editingUser) {
      form.reset(formatUser(editingUser));

      fetchUsageWithFilter({
        start: dayjs().utc().subtract(30, "day").format("YYYY-MM-DDTHH:00:00"),
      });
    }
  }, [editingUser]);

  const submit = (values: FormType) => {
    setLoading(true);
    const methods = { edited: editUser, created: createUser };
    const method = isEditing ? "edited" : "created";
    setError(null);

    const { selected_proxies, ...rest } = values;

    let body: UserCreate = {
      ...rest,
      data_limit: values.data_limit,
      hwid_device_limit: values.hwid_device_limit,
      proxies: mergeProxies(selected_proxies, values.proxies),
      data_limit_reset_strategy:
        values.data_limit && values.data_limit > 0
          ? values.data_limit_reset_strategy
          : "no_reset",
      status:
        values.status === "active" ||
          values.status === "disabled" ||
          values.status === "on_hold"
          ? values.status
          : "active",
    };

    methods[method](body)
      .then(() => {
        toast({
          title: t(
            isEditing ? "userDialog.userEdited" : "userDialog.userCreated",
            { username: values.username }
          ),
          status: "success",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
        onClose();
      })
      .catch((err) => {
        if (err?.response?.status === 409 || err?.response?.status === 400)
          setError(err?.response?._data?.detail);
        if (err?.response?.status === 422) {
          Object.keys(err.response._data.detail).forEach((key) => {
            setError(err?.response._data.detail[key] as string);
            form.setError(
              key as "proxies" | "username" | "data_limit" | "expire",
              {
                type: "custom",
                message: err.response._data.detail[key],
              }
            );
          });
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const onClose = () => {
    form.reset(getDefaultValues());
    onCreateUser(false);
    onEditingUser(null);
    setError(null);
    setUsageVisible(false);
    setUsageFilter("1m");
  };

  const handleResetUsage = () => {
    useDashboard.setState({ resetUsageUser: editingUser });
  };

  const handleRevokeSubscription = () => {
    useDashboard.setState({ revokeSubscriptionUser: editingUser });
  };

  const disabled = loading;
  const isOnHold = userStatus === "on_hold";

  const [randomUsernameLoading, setrandomUsernameLoading] = useState(false);

  const createRandomUsername = (): string => {
    setrandomUsernameLoading(true);
    let result = "";
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < 6) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl">
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      <FormProvider {...form}>
        <ModalContent mx="3">
          <form onSubmit={form.handleSubmit(submit)}>
            <ModalHeader pt={6}>
              <HStack gap={2}>
                <Icon color="primary">
                  {isEditing ? (
                    <EditUserIcon color="white" />
                  ) : (
                    <AddUserIcon color="white" />
                  )}
                </Icon>
                <Text fontWeight="semibold" fontSize="lg">
                  {isEditing
                    ? t("userDialog.editUserTitle")
                    : t("createNewUser")}
                </Text>
              </HStack>
            </ModalHeader>
            <ModalCloseButton mt={3} disabled={disabled} />
            <ModalBody>
              <Grid
                templateColumns={{
                  base: "minmax(0, 1fr)",
                  md: "minmax(0, 1fr) minmax(0, 1fr)",
                }}
                gap={3}
                w="full"
              >
                <GridItem minW={0}>
                  <VStack justifyContent="space-between">
                    <Flex
                      flexDirection="column"
                      gridAutoRows="min-content"
                      w="full"
                    >
                      <Flex flexDirection="row" w="full" gap={2}>
                        <FormControl mb={"10px"}>
                          <FormLabel>
                            <Flex gap={2} alignItems={"center"}>
                              {t("username")}
                              {!isEditing && (
                                <ReloadIcon
                                  cursor={"pointer"}
                                  className={classNames({
                                    "animate-spin": randomUsernameLoading,
                                  })}
                                  onClick={() => {
                                    const randomUsername =
                                      createRandomUsername();
                                    form.setValue("username", randomUsername);
                                    setTimeout(() => {
                                      setrandomUsernameLoading(false);
                                    }, 350);
                                  }}
                                />
                              )}
                            </Flex>
                          </FormLabel>
                          <HStack>
                            <Input
                              size="sm"
                              type="text"
                              borderRadius="6px"
                              error={form.formState.errors.username?.message}
                              disabled={disabled || isEditing}
                              {...form.register("username")}
                            />
                            {isEditing && (
                              <HStack px={1}>
                                <Controller
                                  name="status"
                                  control={form.control}
                                  render={({ field }) => {
                                    return (
                                      <Tooltip
                                        placement="top"
                                        label={"status: " + t(`status.${field.value}`)}
                                        textTransform="capitalize"
                                      >
                                        <Box>
                                          <Switch
                                            colorScheme="primary"
                                            isChecked={field.value === "active"}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                field.onChange("active");
                                              } else {
                                                field.onChange("disabled");
                                              }
                                            }}
                                          />
                                        </Box>
                                      </Tooltip>
                                    );
                                  }}
                                />
                              </HStack>
                            )}
                          </HStack>
                        </FormControl>
                        {!isEditing && (
                          <FormControl flex="1">
                            <FormLabel whiteSpace={"nowrap"}>
                              {t("userDialog.onHold")}
                            </FormLabel>
                            <Controller
                              name="status"
                              control={form.control}
                              render={({ field }) => {
                                const status = field.value;
                                return (
                                  <>
                                    {status ? (
                                      <Switch
                                        colorScheme="primary"
                                        isChecked={status === "on_hold"}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            field.onChange("on_hold");
                                          } else {
                                            field.onChange("active");
                                          }
                                        }}
                                      />
                                    ) : (
                                      ""
                                    )}
                                  </>
                                );
                              }}
                            />
                          </FormControl>
                        )}
                      </Flex>
                      <FormControl mb={"10px"}>
                        <FormLabel>{t("userDialog.dataLimit")}</FormLabel>
                        <Controller
                          control={form.control}
                          name="data_limit"
                          render={({ field }) => {
                            return (
                              <Input
                                endAdornment="GB"
                                type="number"
                                size="sm"
                                borderRadius="6px"
                                onChange={field.onChange}
                                disabled={disabled}
                                error={
                                  form.formState.errors.data_limit?.message
                                }
                                value={field.value ? String(field.value) : ""}
                              />
                            );
                          }}
                        />
                      </FormControl>
                      <FormControl mb={"10px"}>
                        <FormLabel>HWID / Device limit</FormLabel>
                        <Controller
                          control={form.control}
                          name="hwid_device_limit"
                          render={({ field }) => {
                            return (
                              <>
                                <Input
                                  type="number"
                                  size="sm"
                                  borderRadius="6px"
                                  onChange={field.onChange}
                                  disabled={disabled}
                                  value={field.value ? String(field.value) : ""}
                                />
                                <FormHelperText>
                                  Empty uses panel default, 0 disables the limit for this user
                                </FormHelperText>
                              </>
                            );
                          }}
                        />
                      </FormControl>
                      <Collapse
                        in={!!(dataLimit && dataLimit > 0)}
                        animateOpacity
                        style={{ width: "100%" }}
                      >
                        <FormControl height="66px">
                          <FormLabel>
                            {t("userDialog.periodicUsageReset")}
                          </FormLabel>
                          <Controller
                            control={form.control}
                            name="data_limit_reset_strategy"
                            render={({ field }) => {
                              return (
                                <Select
                                  size="sm"
                                  {...field}
                                  disabled={disabled}
                                  bg={disabled ? "gray.100" : "transparent"}
                                  _dark={{
                                    bg: disabled ? "gray.600" : "transparent",
                                  }}
                                  sx={{
                                    option: {
                                      backgroundColor: colorMode === "dark" ? "#222C3B" : "white"
                                    }
                                  }}
                                >
                                  {resetStrategy.map((s) => {
                                    return (
                                      <option key={s.value} value={s.value}>
                                        {t(
                                          "userDialog.resetStrategy" + s.title
                                        )}
                                      </option>
                                    );
                                  })}
                                </Select>
                              );
                            }}
                          />
                        </FormControl>
                      </Collapse>

                      <FormControl mb={"10px"}>
                        <FormLabel>
                          {isOnHold
                            ? t("userDialog.onHoldExpireDuration")
                            : t("userDialog.expiryDate")}
                        </FormLabel>

                        {isOnHold && (
                          <Controller
                            control={form.control}
                            name="on_hold_expire_duration"
                            render={({ field }) => {
                              return (
                                <Input
                                  endAdornment="Days"
                                  type="number"
                                  size="sm"
                                  borderRadius="6px"
                                  onChange={(on_hold) => {
                                    form.setValue("expire", null);
                                    field.onChange({
                                      target: {
                                        value: on_hold,
                                      },
                                    });
                                  }}
                                  disabled={disabled}
                                  error={
                                    form.formState.errors
                                      .on_hold_expire_duration?.message
                                  }
                                  value={field.value ? String(field.value) : ""}
                                />
                              );
                            }}
                          />
                        )}
                        {!isOnHold && (
                          <Controller
                            name="expire"
                            control={form.control}
                            render={({ field }) => {
                              function createDateAsUTC(num: number) {
                                return dayjs(
                                  dayjs(num * 1000).utc()
                                  // .format("MMMM D, YYYY") // exception with: dayjs.locale(lng);
                                ).toDate();
                              }
                              const { status, time } = relativeExpiryDate(
                                field.value
                              );
                              return (
                                <>
                                  <ReactDatePicker
                                    locale={i18n.language.toLocaleLowerCase()}
                                    dateFormat={t("dateFormat")}
                                    minDate={new Date()}
                                    selected={
                                      field.value
                                        ? createDateAsUTC(field.value)
                                        : undefined
                                    }
                                    onChange={(date: Date) => {
                                      form.setValue(
                                        "on_hold_expire_duration",
                                        null
                                      );
                                      field.onChange({
                                        target: {
                                          value: date
                                            ? dayjs(
                                              dayjs(date)
                                                .set("hour", 23)
                                                .set("minute", 59)
                                                .set("second", 59)
                                            )
                                              .utc()
                                              .valueOf() / 1000
                                            : 0,
                                          name: "expire",
                                        },
                                      });
                                    }}
                                    customInput={
                                      <Input
                                        size="sm"
                                        type="text"
                                        borderRadius="6px"
                                        clearable
                                        disabled={disabled}
                                        error={
                                          form.formState.errors.expire?.message
                                        }
                                      />
                                    }
                                  />
                                  {field.value ? (
                                    <FormHelperText>
                                      {t(status, { time: time })}
                                    </FormHelperText>
                                  ) : (
                                    ""
                                  )}
                                </>
                              );
                            }}
                          />
                        )}
                      </FormControl>

                      <FormControl
                        mb={"10px"}
                        isInvalid={!!form.formState.errors.note}
                      >
                        <FormLabel>{t("userDialog.note")}</FormLabel>
                        <Textarea {...form.register("note")} />
                        <FormErrorMessage>
                          {form.formState.errors?.note?.message}
                        </FormErrorMessage>
                      </FormControl>
                    </Flex>
                    {error && (
                      <Alert
                        status="error"
                        display={{ base: "none", md: "flex" }}
                      >
                        <AlertIcon />
                        {error}
                      </Alert>
                    )}
                  </VStack>
                </GridItem>
                <GridItem minW={0}>
                  <FormControl
                    isInvalid={
                      !!form.formState.errors.selected_proxies?.message
                    }
                  >
                    <FormLabel>{t("userDialog.protocols")}</FormLabel>
                    <Controller
                      control={form.control}
                      name="selected_proxies"
                      render={({ field }) => {
                        return (
                          <RadioGroup
                            list={[
                              {
                                title: "vmess",
                                description: t("userDialog.vmessDesc"),
                              },
                              {
                                title: "vless",
                                description: t("userDialog.vlessDesc"),
                              },
                              {
                                title: "trojan",
                                description: t("userDialog.trojanDesc"),
                              },
                              {
                                title: "shadowsocks",
                                description: t("userDialog.shadowsocksDesc"),
                              },
                            ]}
                            disabled={disabled}
                            {...field}
                          />
                        );
                      }}
                    />
                    <FormErrorMessage>
                      {t(
                        form.formState.errors.selected_proxies
                          ?.message as string
                      )}
                    </FormErrorMessage>
                  </FormControl>
                  {isEditing && (
                    <FormControl mt={4}>
                      {(() => {
                        const registeredCount = editingUser?.hwid_devices?.length || 0;
                        const effectiveLimit = editingUser?.effective_hwid_device_limit;
                        const limitLabel =
                          effectiveLimit === 0 ||
                          effectiveLimit === null ||
                          effectiveLimit === undefined
                            ? "∞"
                            : String(effectiveLimit);
                        return (
                      <HStack justifyContent="space-between" mb={2}>
                        <FormLabel m={0}>Connected Devices</FormLabel>
                        <Text fontSize="sm" color="gray.500">
                          {registeredCount}/{limitLabel}
                        </Text>
                      </HStack>
                        );
                      })()}
                      <Box
                        borderWidth="1px"
                        borderRadius="10px"
                        p={{ base: 2, md: 2 }}
                        maxH="340px"
                        overflowY="auto"
                        minW={0}
                      >
                        {!!editingUser?.hwid_devices?.length ? (
                          <VStack align="stretch" gap={{ base: 2, md: 2 }}>
                            {editingUser.hwid_devices.map((device) => {
                              const meta = getDeviceVisualMeta(device.user_agent);
                              const labelProps = {
                                fontSize: "2xs" as const,
                                color: "gray.500",
                                fontWeight: "semibold" as const,
                                textTransform: "uppercase" as const,
                                letterSpacing: "0.04em",
                                mb: 0.5,
                              };
                              const valueLineProps = {
                                minW: 0,
                                w: "100%",
                                wordBreak: "break-word" as const,
                                overflowWrap: "anywhere" as const,
                              };
                              return (
                                <Box
                                  key={device.device_id}
                                  borderWidth="1px"
                                  borderRadius="md"
                                  p={{ base: 3, md: 3 }}
                                  minW={0}
                                  bg="blackAlpha.20"
                                  _dark={{ bg: "whiteAlpha.50" }}
                                >
                                  <Flex align="flex-start" gap={{ base: 2, md: 3 }} minW={0}>
                                    <Box flexShrink={0} pt={0.5}>
                                      <Icon color={`${meta.colorScheme}.400`}>
                                        {getDeviceIcon(meta.platform)}
                                      </Icon>
                                    </Box>
                                    <VStack align="stretch" spacing={2} flex="1" minW={0}>
                                      <Box {...valueLineProps}>
                                        <Text {...labelProps}>App</Text>
                                        <Tooltip label={meta.appName} placement="top" openDelay={400}>
                                          <Text
                                            fontSize="sm"
                                            fontWeight="semibold"
                                            lineHeight={1.25}
                                            noOfLines={1}
                                            whiteSpace="nowrap"
                                            overflow="hidden"
                                            textOverflow="ellipsis"
                                          >
                                            {meta.appName}
                                          </Text>
                                        </Tooltip>
                                      </Box>
                                      <Box {...valueLineProps}>
                                        <Text {...labelProps}>Platform</Text>
                                        <Box
                                          display="inline-block"
                                          px={2}
                                          py={0.5}
                                          borderRadius="md"
                                          bg={`${meta.colorScheme}.500`}
                                          color="white"
                                          fontSize="xs"
                                          fontWeight="medium"
                                        >
                                          {meta.platformBadge}
                                        </Box>
                                      </Box>
                                      <Box {...valueLineProps}>
                                        <Text {...labelProps}>Device</Text>
                                        <Tooltip label={meta.deviceDetail} placement="top" openDelay={400}>
                                          <Text fontSize="xs" opacity={0.95} noOfLines={3}>
                                            {meta.deviceDetail}
                                          </Text>
                                        </Tooltip>
                                      </Box>
                                      <Box {...valueLineProps}>
                                        <Text {...labelProps}>Last seen</Text>
                                        <Text fontSize="xs" opacity={0.9} whiteSpace="nowrap">
                                          {dayjs(device.last_seen_at).format("YYYY-MM-DD HH:mm")}
                                        </Text>
                                      </Box>
                                      <Box {...valueLineProps}>
                                        <Text {...labelProps}>HWID</Text>
                                        <Tooltip label={device.device_id} placement="top" openDelay={300}>
                                          <Text
                                            fontSize="xs"
                                            opacity={0.85}
                                            fontFamily="mono"
                                            noOfLines={2}
                                            sx={{ lineBreak: "anywhere" }}
                                          >
                                            {device.device_id}
                                          </Text>
                                        </Tooltip>
                                      </Box>
                                    </VStack>
                                    <Tooltip label="Delete device" placement="top">
                                      <IconButton
                                        aria-label="Delete device"
                                        size="sm"
                                        colorScheme="red"
                                        variant="ghost"
                                        flexShrink={0}
                                        alignSelf="flex-start"
                                        isLoading={deletingDeviceId === device.device_id}
                                        onClick={() => {
                                          if (!editingUser) return;
                                          setDeletingDeviceId(device.device_id);
                                          removeUserDevice(editingUser, device.device_id)
                                            .catch((err) => {
                                              setError(err?.response?._data?.detail || "Failed to delete device");
                                            })
                                            .finally(() => setDeletingDeviceId(null));
                                        }}
                                      >
                                        <DeviceRemoveIcon />
                                      </IconButton>
                                    </Tooltip>
                                  </Flex>
                                </Box>
                              );
                            })}
                          </VStack>
                        ) : (
                          <Text fontSize="sm" color="gray.500" p={2}>
                            No registered devices yet
                          </Text>
                        )}
                      </Box>
                    </FormControl>
                  )}
                </GridItem>
                {isEditing && usageVisible && (
                  <GridItem pt={6} colSpan={{ base: 1, md: 2 }}>
                    <VStack gap={4}>
                      <UsageFilter
                        defaultValue={usageFilter}
                        onChange={(filter, query) => {
                          setUsageFilter(filter);
                          fetchUsageWithFilter(query);
                        }}
                      />
                      <Box
                        width={{ base: "100%", md: "70%" }}
                        justifySelf="center"
                      >
                        <ReactApexChart
                          options={usage.options}
                          series={usage.series}
                          type="donut"
                        />
                      </Box>
                    </VStack>
                  </GridItem>
                )}
              </Grid>
              {error && (
                <Alert
                  mt="3"
                  status="error"
                  display={{ base: "flex", md: "none" }}
                >
                  <AlertIcon />
                  {error}
                </Alert>
              )}
            </ModalBody>
            <ModalFooter mt="3">
              <HStack
                justifyContent="space-between"
                w="full"
                gap={3}
                flexDirection={{
                  base: "column",
                  sm: "row",
                }}
              >
                <HStack
                  justifyContent="flex-start"
                  w={{
                    base: "full",
                    sm: "unset",
                  }}
                >
                  {isEditing && (
                    <>
                      <Tooltip label={t("delete")} placement="top">
                        <IconButton
                          aria-label="Delete"
                          size="sm"
                          onClick={() => {
                            onDeletingUser(editingUser);
                            onClose();
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip label={t("userDialog.usage")} placement="top">
                        <IconButton
                          aria-label="usage"
                          size="sm"
                          onClick={handleUsageToggle}
                        >
                          <UserUsageIcon />
                        </IconButton>
                      </Tooltip>
                      <Button onClick={handleResetUsage} size="sm">
                        {t("userDialog.resetUsage")}
                      </Button>
                      <Button onClick={handleRevokeSubscription} size="sm">
                        {t("userDialog.revokeSubscription")}
                      </Button>
                    </>
                  )}
                </HStack>
                <HStack
                  w="full"
                  maxW={{ md: "50%", base: "full" }}
                  justify="end"
                >
                  <Button
                    type="submit"
                    size="sm"
                    px="8"
                    colorScheme="primary"
                    leftIcon={loading ? <Spinner size="xs" /> : undefined}
                    disabled={disabled}
                  >
                    {isEditing ? t("userDialog.editUser") : t("createUser")}
                  </Button>
                </HStack>
              </HStack>
            </ModalFooter>
          </form>
        </ModalContent>
      </FormProvider>
    </Modal>
  );
};
