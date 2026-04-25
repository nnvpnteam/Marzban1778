import { BoxProps, Flex, Link, Text } from "@chakra-ui/react";
import { ORGANIZATION_URL, REPO_URL } from "constants/Project";
import { useDashboard } from "contexts/DashboardContext";
import { FC } from "react";

export const Footer: FC<BoxProps> = (props) => {
  const { version } = useDashboard();
  const commit =
    (import.meta.env.VITE_COMMIT_SHA as string | undefined)?.trim() || "";
  const shortCommit = commit ? commit.slice(0, 8) : "";
  return (
    <Flex
      w="full"
      py={2}
      position="relative"
      flexDirection={{ base: "column", md: "row" }}
      align={{ base: "stretch", md: "center" }}
      gap={{ base: 1, md: 0 }}
      {...props}
    >
      <Text
        display="inline-block"
        flexGrow={1}
        textAlign={{ base: "left", md: "center" }}
        color="gray.500"
        fontSize="xs"
        pr={{ base: 0, md: shortCommit ? 24 : 0 }}
      >
        <Link color="blue.400" href={REPO_URL}>
          Marzban
        </Link>
        {version ? ` (v${version}), ` : ", "}
        Made with ❤️ in{" "}
        <Link color="blue.400" href={ORGANIZATION_URL}>
          Gozargah
        </Link>
      </Text>
      {shortCommit && (
        <Text
          position={{ base: "static", md: "absolute" }}
          right={{ md: 0 }}
          bottom={{ md: 0 }}
          alignSelf={{ base: "flex-end", md: "auto" }}
          color="gray.500"
          fontSize="xs"
          opacity={0.9}
          fontFamily="mono"
        >
          {shortCommit}
        </Text>
      )}
    </Flex>
  );
};
