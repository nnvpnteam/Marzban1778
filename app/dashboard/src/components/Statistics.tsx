import {
  Box,
  BoxProps,
  Card,
  chakra,
  HStack,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import {
  BanknotesIcon,
  ChartBarIcon,
  SignalIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useDashboard } from "contexts/DashboardContext";
import { FC, PropsWithChildren, ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import { fetch } from "service/http";
import { formatBytes, numberWithCommas } from "utils/formatByte";

const RegisteredUsersIcon = chakra(UserGroupIcon, {
  baseStyle: {
    w: { base: 4, md: 5 },
    h: { base: 4, md: 5 },
    position: "relative",
    zIndex: "2",
  },
});

const OnlineUsersIcon = chakra(SignalIcon, {
  baseStyle: {
    w: { base: 4, md: 5 },
    h: { base: 4, md: 5 },
    position: "relative",
    zIndex: "2",
  },
});

const PaidUsersIcon = chakra(BanknotesIcon, {
  baseStyle: {
    w: { base: 4, md: 5 },
    h: { base: 4, md: 5 },
    position: "relative",
    zIndex: "2",
  },
});

const NetworkIcon = chakra(ChartBarIcon, {
  baseStyle: {
    w: { base: 4, md: 5 },
    h: { base: 4, md: 5 },
    position: "relative",
    zIndex: "2",
  },
});

type StatisticCardProps = {
  title: string;
  content: ReactNode;
  icon: ReactElement;
  accentColor?: string;
};

const StatisticCard: FC<PropsWithChildren<StatisticCardProps>> = ({
  title,
  content,
  icon,
  accentColor = "primary.400",
}) => {
  return (
    <Card
      p={{ base: 3, sm: 4, md: 6 }}
      borderWidth="1px"
      borderColor="light-border"
      bg="#F9FAFB"
      _dark={{ borderColor: "gray.600", bg: "gray.750" }}
      borderStyle="solid"
      boxShadow="none"
      borderRadius={{ base: "10px", md: "12px" }}
      width="full"
      display="flex"
      justifyContent="space-between"
      flexDirection="row"
      minW={0}
    >
      <HStack alignItems="center" columnGap={{ base: 2, md: 4 }} minW={0}>
        <Box
          p={{ base: "1.5", md: "2" }}
          position="relative"
          color="white"
          _before={{
            content: `""`,
            position: "absolute",
            top: 0,
            left: 0,
            bg: accentColor,
            display: "block",
            w: "full",
            h: "full",
            borderRadius: "5px",
            opacity: ".5",
            z: "1",
          }}
          _after={{
            content: `""`,
            position: "absolute",
            top: "-5px",
            left: "-5px",
            bg: accentColor,
            display: "block",
            w: "calc(100% + 10px)",
            h: "calc(100% + 10px)",
            borderRadius: "8px",
            opacity: ".4",
            z: "1",
          }}
        >
          {icon}
        </Box>
        <Text
          color="gray.600"
          _dark={{
            color: "gray.300",
          }}
          fontWeight="medium"
          textTransform="capitalize"
          fontSize={{ base: "10px", sm: "xs", md: "sm" }}
          noOfLines={2}
          lineHeight="short"
        >
          {title}
        </Text>
      </HStack>
      <Box
        fontSize={{ base: "xl", sm: "2xl", md: "3xl" }}
        fontWeight="semibold"
        mt={{ base: 0, md: 2 }}
        flexShrink={0}
        textAlign="right"
        minW={0}
      >
        {content}
      </Box>
    </Card>
  );
};
export const StatisticsQueryKey = "statistics-query-key";
export const Statistics: FC<BoxProps> = (props) => {
  const { version } = useDashboard();
  const { data: systemData } = useQuery({
    queryKey: StatisticsQueryKey,
    queryFn: () => fetch("/system"),
    refetchInterval: 5000,
    onSuccess: ({ version: currentVersion }) => {
      if (version !== currentVersion)
        useDashboard.setState({ version: currentVersion });
    },
  });
  const { t } = useTranslation();
  return (
    <SimpleGrid
      columns={{ base: 2, md: 2, xl: 4 }}
      spacing={{ base: 2, md: 3, xl: 4 }}
      w="full"
      {...props}
    >
      <StatisticCard
        title={t("totalUsers")}
        content={
          systemData && (
            <HStack spacing={1} alignItems="baseline" display="inline-flex">
              <Text as="span" fontWeight="semibold">
                {numberWithCommas(systemData.users_active)}
              </Text>
              <Text
                as="span"
                fontWeight="normal"
                fontSize={{ base: "md", sm: "lg", md: "xl" }}
                color="gray.500"
                _dark={{ color: "gray.400" }}
              >
                /
              </Text>
              <Text
                as="span"
                fontWeight="normal"
                fontSize={{ base: "md", sm: "lg", md: "xl" }}
                color="gray.500"
                _dark={{ color: "gray.400" }}
              >
                {numberWithCommas(systemData.total_user)}
              </Text>
            </HStack>
          )
        }
        icon={<RegisteredUsersIcon />}
      />
      <StatisticCard
        title={t("paidUsers")}
        content={systemData && <Text>{numberWithCommas(systemData.paid_users)}</Text>}
        icon={<PaidUsersIcon />}
      />
      <StatisticCard
        title={t("activeNow")}
        content={systemData && <Text>{numberWithCommas(systemData.online_users)}</Text>}
        icon={<OnlineUsersIcon />}
      />
      <StatisticCard
        title={t("dataUsage")}
        content={
          systemData &&
          formatBytes(
            systemData.incoming_bandwidth + systemData.outgoing_bandwidth
          )
        }
        icon={<NetworkIcon />}
      />
    </SimpleGrid>
  );
};
