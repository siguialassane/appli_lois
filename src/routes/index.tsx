import { createFileRoute } from "@tanstack/react-router";

import { ChatShell } from "@/components/chat-shell";
import { PwaRegister } from "@/components/pwa-register";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <>
      <PwaRegister />
      <ChatShell />
    </>
  );
}
