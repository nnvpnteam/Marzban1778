import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  VStack,
  Wrap,
  WrapItem,
  useToast,
} from "@chakra-ui/react";
import { fetch } from "service/http";
import { useDashboard } from "contexts/DashboardContext";
import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NodeType } from "contexts/NodesContext";

type MeterList = (number | null)[];

type SettingsPayload = {
  trial_metered_node_ids: MeterList;
  paid_metered_node_ids: MeterList;
};

type Row = { id: number | null; name: string };

const coreKey = "__core__" as const;

const toKey = (id: number | null) => (id === null ? coreKey : String(id));

const fromKey = (k: string): number | null =>
  k === coreKey ? null : Number.parseInt(k, 10);

const listToSet = (list: MeterList): Set<string> =>
  new Set(list.map((id) => toKey(id)));

const setToList = (s: Set<string>): MeterList =>
  Array.from(s).map((k) => fromKey(k));

type PoolEditorProps = {
  tab: "trial" | "paid";
  rows: Row[];
  trial: Set<string>;
  paid: Set<string>;
  setTrial: (s: Set<string>) => void;
  setPaid: (s: Set<string>) => void;
  t: (k: string) => string;
};

const PoolEditor: FC<PoolEditorProps> = ({
  tab,
  rows,
  trial,
  paid,
  setTrial,
  setPaid,
  t,
}) => {
  const set = tab === "trial" ? trial : paid;
  const apply = (next: Set<string>) =>
    tab === "trial" ? setTrial(next) : setPaid(next);

  const inPool = rows.filter((r) => set.has(toKey(r.id)));
  const available = rows.filter((r) => !set.has(toKey(r.id)));

  const add = (id: number | null) => {
    const next = new Set(set);
    next.add(toKey(id));
    apply(next);
  };

  const remove = (id: number | null) => {
    const next = new Set(set);
    next.delete(toKey(id));
    apply(next);
  };

  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} alignItems="stretch">
      <Box
        borderWidth="1px"
        borderRadius="md"
        borderColor="light-border"
        p={3}
        bg="gray.50"
        _dark={{ bg: "gray.800", borderColor: "gray.600" }}
      >
        <Text
          fontSize="xs"
          fontWeight="semibold"
          color="gray.700"
          _dark={{ color: "gray.200" }}
          mb={2}
        >
          {t("subscriptionTraffic.inPool")}
        </Text>
        <Wrap spacing={2}>
          {inPool.map((row) => (
            <WrapItem key={toKey(row.id)}>
              <Tag
                size="md"
                borderRadius="full"
                variant="subtle"
                colorScheme="blue"
                maxW="100%"
              >
                <TagLabel isTruncated>
                  {row.name}
                  {row.id != null ? ` #${row.id}` : ""}
                </TagLabel>
                <TagCloseButton
                  aria-label="remove"
                  onClick={() => remove(row.id)}
                />
              </Tag>
            </WrapItem>
          ))}
        </Wrap>
        {inPool.length === 0 && (
          <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.500" }}>
            —
          </Text>
        )}
      </Box>
      <Box
        borderWidth="1px"
        borderRadius="md"
        borderColor="light-border"
        bg="white"
        _dark={{ bg: "gray.900", borderColor: "gray.600" }}
        maxH={{ base: "42vh", md: "38vh" }}
        display="flex"
        flexDirection="column"
        overflow="hidden"
      >
        <Text
          fontSize="xs"
          fontWeight="semibold"
          color="gray.700"
          _dark={{ color: "gray.200" }}
          px={3}
          pt={3}
          pb={2}
          flexShrink={0}
        >
          {t("subscriptionTraffic.addToPool")}
        </Text>
        <VStack align="stretch" spacing={0} overflowY="auto" flex="1" minH={0}>
          {available.map((row, idx) => (
            <HStack
              key={toKey(row.id)}
              justify="space-between"
              px={3}
              py={2.5}
              flexShrink={0}
              gap={2}
              borderBottomWidth={
                idx < available.length - 1 ? "1px" : undefined
              }
              borderColor="gray.100"
              _dark={{ borderColor: "gray.700" }}
            >
              <Text fontSize="sm" noOfLines={1} flex={1} minW={0}>
                {row.name}
                {row.id != null ? ` (#${row.id})` : ""}
              </Text>
              <Button
                size="xs"
                variant="solid"
                colorScheme="primary"
                flexShrink={0}
                minW="32px"
                px={2}
                onClick={() => add(row.id)}
              >
                +
              </Button>
            </HStack>
          ))}
        </VStack>
      </Box>
    </SimpleGrid>
  );
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export const SubscriptionTrafficSettingsModal: FC<Props> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [nodes, setNodes] = useState<NodeType[]>([]);
  const [trial, setTrial] = useState<Set<string>>(new Set());
  const [paid, setPaid] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  const [bulkDays, setBulkDays] = useState("");
  const [bulkGb, setBulkGb] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const coreRow = useMemo(
    () => ({ id: null as number | null, name: t("subscriptionTraffic.core") }),
    [t]
  );

  const rows: Row[] = useMemo(() => {
    const remote = (nodes || [])
      .filter((n) => n.id != null)
      .map((n) => ({ id: n.id as number, name: n.name }));
    return [coreRow, ...remote];
  }, [nodes, coreRow]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ns, st]: [NodeType[], SettingsPayload] = await Promise.all([
        fetch("/nodes"),
        fetch("/subscription_traffic_settings"),
      ]);
      setNodes(ns);
      setTrial(listToSet(st.trial_metered_node_ids || []));
      setPaid(listToSet(st.paid_metered_node_ids || []));
    } catch {
      toast({ title: t("subscriptionTraffic.loadError"), status: "error" });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/subscription_traffic_settings", {
        method: "PUT",
        body: {
          trial_metered_node_ids: setToList(trial),
          paid_metered_node_ids: setToList(paid),
        },
      });
      toast({ title: t("subscriptionTraffic.saved"), status: "success" });
      onClose();
    } catch {
      toast({ title: t("subscriptionTraffic.saveError"), status: "error" });
    } finally {
      setSaving(false);
    }
  };

  const applyBulk = async () => {
    const dRaw = bulkDays.trim();
    const gRaw = bulkGb.trim();
    const d = dRaw === "" ? null : Number.parseInt(dRaw, 10);
    const g = gRaw === "" ? null : Number.parseFloat(gRaw);
    const hasD = d !== null && Number.isFinite(d) && d !== 0;
    const hasG = g !== null && Number.isFinite(g) && g !== 0;
    if (!hasD && !hasG) {
      toast({
        title: t("subscriptionTraffic.bulkNeedChange"),
        status: "warning",
      });
      return;
    }
    const group = tabIndex === 0 ? "trial" : "paid";
    const label =
      group === "trial"
        ? t("subscriptionTraffic.tabTrial")
        : t("subscriptionTraffic.tabPaid");
    if (
      !window.confirm(
        t("subscriptionTraffic.bulkConfirm", {
          group: label,
        })
      )
    ) {
      return;
    }
    setBulkSaving(true);
    try {
      const body: Record<string, unknown> = { group };
      if (hasD) body.add_expire_days = d;
      if (hasG) body.add_data_limit_gb = g;
      const res = await fetch<{ matched_users: number }>(
        "/subscription_traffic_group_bulk",
        { method: "POST", body }
      );
      toast({
        title: t("subscriptionTraffic.bulkDone", {
          count: res.matched_users,
        }),
        status: "success",
      });
      useDashboard.getState().refetchUsers();
      setBulkDays("");
      setBulkGb("");
    } catch {
      toast({ title: t("subscriptionTraffic.bulkError"), status: "error" });
    } finally {
      setBulkSaving(false);
    }
  };

  const bulkGroupLabel =
    tabIndex === 0
      ? t("subscriptionTraffic.tabTrial")
      : t("subscriptionTraffic.tabPaid");

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent mx={3}>
        <ModalHeader pr={10}>{t("subscriptionTraffic.title")}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text
            fontSize="sm"
            color="gray.600"
            _dark={{ color: "gray.400" }}
            mb={3}
          >
            {t("subscriptionTraffic.hint")}
          </Text>
          <Tabs
            variant="enclosed"
            index={tabIndex}
            onChange={(i) => setTabIndex(i)}
          >
            <TabList>
              <Tab>{t("subscriptionTraffic.tabTrial")}</Tab>
              <Tab>{t("subscriptionTraffic.tabPaid")}</Tab>
            </TabList>
            <TabPanels>
              <TabPanel px={0} pt={3}>
                {loading ? (
                  <Text fontSize="sm">{t("subscriptionTraffic.loading")}</Text>
                ) : (
                  <PoolEditor
                    tab="trial"
                    rows={rows}
                    trial={trial}
                    paid={paid}
                    setTrial={setTrial}
                    setPaid={setPaid}
                    t={t}
                  />
                )}
              </TabPanel>
              <TabPanel px={0} pt={3}>
                {loading ? (
                  <Text fontSize="sm">{t("subscriptionTraffic.loading")}</Text>
                ) : (
                  <PoolEditor
                    tab="paid"
                    rows={rows}
                    trial={trial}
                    paid={paid}
                    setTrial={setTrial}
                    setPaid={setPaid}
                    t={t}
                  />
                )}
              </TabPanel>
            </TabPanels>
          </Tabs>

          <Box
            mt={5}
            borderWidth="1px"
            borderRadius="md"
            borderColor="light-border"
            p={4}
            bg="gray.50"
            _dark={{ bg: "gray.800", borderColor: "gray.600" }}
          >
            <Text fontSize="sm" fontWeight="semibold" mb={1}>
              {t("subscriptionTraffic.bulkTitle")}
            </Text>
            <Text
              fontSize="xs"
              color="gray.600"
              _dark={{ color: "gray.400" }}
              mb={3}
            >
              {t("subscriptionTraffic.bulkScopeShort", { group: bulkGroupLabel })}
            </Text>
            <HStack align="flex-end" spacing={3} flexWrap="wrap">
              <FormControl maxW="140px">
                <FormLabel fontSize="xs" mb={1} fontWeight="medium">
                  {t("subscriptionTraffic.bulkDays")}
                </FormLabel>
                <Input
                  size="md"
                  type="number"
                  bg="white"
                  _dark={{ bg: "gray.900" }}
                  value={bulkDays}
                  onChange={(e) => setBulkDays(e.target.value)}
                  placeholder="±7"
                />
              </FormControl>
              <FormControl maxW="140px">
                <FormLabel fontSize="xs" mb={1} fontWeight="medium">
                  {t("subscriptionTraffic.bulkGb")}
                </FormLabel>
                <Input
                  size="md"
                  type="number"
                  step="0.1"
                  bg="white"
                  _dark={{ bg: "gray.900" }}
                  value={bulkGb}
                  onChange={(e) => setBulkGb(e.target.value)}
                  placeholder="±10"
                />
              </FormControl>
              <Button
                colorScheme="primary"
                variant="outline"
                size="md"
                isLoading={bulkSaving}
                onClick={() => void applyBulk()}
              >
                {t("subscriptionTraffic.bulkApply")}
              </Button>
            </HStack>
          </Box>
        </ModalBody>
        <ModalFooter borderTopWidth="1px" borderColor="light-border" _dark={{ borderColor: "gray.600" }}>
          <HStack w="full" justify="flex-end" spacing={2}>
            <Button variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              colorScheme="primary"
              isLoading={saving}
              onClick={() => void save()}
            >
              {t("apply")}
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
