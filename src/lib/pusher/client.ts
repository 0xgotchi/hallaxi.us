import Pusher from "pusher-js";

export const pusherClient =
  process.env.NEXT_PHASE !== "phase-production-build"
    ? new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        forceTLS: true,
      })
    : undefined;
