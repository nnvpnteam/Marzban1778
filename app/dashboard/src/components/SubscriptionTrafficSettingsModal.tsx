import {
  Box,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { fetch } from "service/http";
import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NodeType } from "contexts/NodesContext";

type MeterList = (number | null)[];

type SettingsPayload = {
  trial_metered_node_ids: MeterList;
  paid_metered_node_ids: MeterList;
};

const coreKey = "__core__" as const;

const toKey = (id: number | null) => (id === null ? coreKey : String(id));

const fromKey = (k: string): number | null =>
  k === coreKey ? null : Number.parseInt(k, 10);

const listToSet = (list: MeterList): Set<string> =>
  new Set(list.map((id) => toKey(id)));

const setToList = (s: Set<string>): MeterList =>
  Array.from(s).map((k) => fromKey(k));

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

  const coreRow = useMemo(
    () => ({ id: null as number | null, name: t("subscriptionTraffic.core") }),
    [t]
  );

  const rows = useMemo(() => {
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

  const toggle = (tab: "trial" | "paid", id: number | null) => {
    const k = toKey(id);
    const mut = tab === "trial" ? trial : paid;
    const next = new Set(mut);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    if (tab === "trial") setTrial(next);
    else setPaid(next);
  };

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

  const renderPanel = (tab: "trial" | "paid") => (
    <VStack align="stretch" spacing={2} maxH="52vh" overflowY="auto" pr={1}>
      {rows.map((row) => {
        const set = tab === "trial" ? trial : paid;
        const active = set.has(toKey(row.id));
        return (
          <Button
            key={toKey(row.id)}
            size="sm"
            variant={active ? "solid" : "outline"}
            colorScheme={active ? "blue" : "gray"}
            justifyContent="flex-start"
            onClick={() => toggle(tab, row.id)}
          >
            {row.name}
            {row.id != null ? ` (#${row.id})` : ""}
          </Button>
        );
      })}
    </VStack>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{t("subscriptionTraffic.title")}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }} mb={3}>
            {t("subscriptionTraffic.hint")}
          </Text>
          <Tabs variant="enclosed">
            <TabList>
              <Tab>{t("subscriptionTraffic.tabTrial")}</Tab>
              <Tab>{t("subscriptionTraffic.tabPaid")}</Tab>
            </TabList>
            <TabPanels>
              <TabPanel px={0}>
                {loading ? (
                  <Text fontSize="sm">{t("subscriptionTraffic.loading")}</Text>
                ) : (
                  renderPanel("trial")
                )}
              </TabPanel>
              <TabPanel px={0}>
                {loading ? (
                  <Text fontSize="sm">{t("subscriptionTraffic.loading")}</Text>
                ) : (
                  renderPanel("paid")
                )}
              </TabPanel>
            </TabPanels>
          </Tabs>
        </ModalBody>
        <ModalFooter>
          <HStack>
            <Button variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button colorScheme="primary" isLoading={saving} onClick={() => void save()}>
              {t("apply")}
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
