import { BoxProps, HStack, Link, Text } from "@chakra-ui/react";
import { ORGANIZATION_URL, REPO_URL } from "constants/Project";
import { useDashboard } from "contexts/DashboardContext";
import { FC } from "react";

export const Footer: FC<BoxProps> = (props) => {
  const { version } = useDashboard();
  const commit =
    (import.meta.env.VITE_COMMIT_SHA as string | undefined)?.trim() || "";
  const shortCommit = commit ? commit.slice(0, 8) : "";
  return (
    <HStack w="full" py="0" position="relative" {...props}>
      <Text
        display="inline-block"
        flexGrow={1}
        textAlign="center"
        color="gray.500"
        fontSize="xs"
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
          position="absolute"
          right={0}
          bottom={0}
          color="gray.500"
          fontSize="xs"
          opacity={0.9}
          fontFamily="mono"
        >
          {shortCommit}
        </Text>
      )}
    </HStack>
  );
};
