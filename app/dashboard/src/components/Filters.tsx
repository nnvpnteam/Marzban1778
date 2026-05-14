import {
  BoxProps,
  Button,
  chakra,
  Flex,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Spinner,
} from "@chakra-ui/react";
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import classNames from "classnames";
import { useDashboard } from "contexts/DashboardContext";
import debounce from "lodash.debounce";
import React, { FC, useState } from "react";
import { useTranslation } from "react-i18next";
import useGetUser from "hooks/useGetUser";
import { SubscriptionTrafficSettingsModal } from "./SubscriptionTrafficSettingsModal";

const iconProps = {
  baseStyle: {
    w: 4,
    h: 4,
  },
};

const SearchIcon = chakra(MagnifyingGlassIcon, iconProps);
const ClearIcon = chakra(XMarkIcon, iconProps);
export const ReloadIcon = chakra(ArrowPathIcon, iconProps);
export type FilterProps = {} & BoxProps;
const setSearchField = debounce((search: string) => {
  useDashboard.getState().onFilterChange({
    ...useDashboard.getState().filters,
    offset: 0,
    search,
  });
}, 300);

export const Filters: FC<FilterProps> = ({ ...props }) => {
  const { loading, filters, onFilterChange, refetchUsers, onCreateUser } =
    useDashboard();
  const { t } = useTranslation();
  const { userData } = useGetUser();
  const [search, setSearch] = useState("");
  const [poolSettingsOpen, setPoolSettingsOpen] = useState(false);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setSearchField(e.target.value);
  };
  const clear = () => {
    setSearch("");
    onFilterChange({
      ...filters,
      offset: 0,
      search: "",
    });
  };
  return (
    <>
    <Flex
      id="filters"
      flexDirection={{ base: "column-reverse", md: "row" }}
      align={{ base: "stretch", md: "center" }}
      justify={{ md: "space-between" }}
      gap={4}
      w="full"
      flexWrap={{ md: "nowrap" }}
      position="sticky"
      top={0}
      bg="var(--chakra-colors-chakra-body-bg)"
      py={4}
      zIndex="docked"
      {...props}
    >
      <HStack spacing={2} align="stretch" w={{ base: "full", md: "auto" }} flex={{ md: "1" }} minW={0}>
        <InputGroup flex="1" minW={0}>
          <InputLeftElement pointerEvents="none" children={<SearchIcon />} />
          <Input
            size="md"
            placeholder={t("search")}
            value={search}
            borderColor="light-border"
            onChange={onChange}
          />

          <InputRightElement>
            {loading && <Spinner size="xs" />}
            {filters.search && filters.search.length > 0 && (
              <IconButton
                type="button"
                onClick={clear}
                aria-label="clear"
                size="xs"
                variant="ghost"
              >
                <ClearIcon />
              </IconButton>
            )}
          </InputRightElement>
        </InputGroup>
        {userData.is_sudo && (
          <Button
            type="button"
            flexShrink={0}
            size="md"
            variant="outline"
            borderColor="light-border"
            color="gray.600"
            fontWeight="medium"
            px={3}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setPoolSettingsOpen(true);
            }}
            _hover={{ bg: "gray.50", borderColor: "gray.300" }}
            _active={{ bg: "gray.100" }}
            _dark={{
              color: "gray.300",
              borderColor: "gray.600",
              _hover: { bg: "whiteAlpha.100" },
              _active: { bg: "whiteAlpha.200" },
            }}
          >
            {t("filters.trafficGroupsButton")}
          </Button>
        )}
      </HStack>
      <HStack
        justifyContent="flex-end"
        alignItems="center"
        flexWrap="wrap"
        gap={2}
        flexShrink={0}
        w={{ base: "full", md: "auto" }}
      >
        <IconButton
          type="button"
          aria-label="refresh users"
          disabled={loading}
          onClick={refetchUsers}
          size="md"
          variant="outline"
        >
          <ReloadIcon
            className={classNames({
              "animate-spin": loading,
            })}
          />
        </IconButton>
        <Button
          type="button"
          colorScheme="primary"
          size="md"
          onClick={() => onCreateUser(true)}
          px={5}
        >
          {t("createUser")}
        </Button>
      </HStack>
    </Flex>
    <SubscriptionTrafficSettingsModal
      isOpen={poolSettingsOpen}
      onClose={() => setPoolSettingsOpen(false)}
    />
    </>
  );
};
