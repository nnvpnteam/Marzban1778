import { Box } from "@chakra-ui/react";
import "react-datepicker/dist/react-datepicker.css";
import "react-loading-skeleton/dist/skeleton.css";
import { RouterProvider } from "react-router-dom";
import { router } from "./pages/Router";

function App() {
  return (
    <Box as="main" maxW="100vw" overflowX="hidden" minH="100vh">
      <RouterProvider router={router} />
    </Box>
  );
}

export default App;