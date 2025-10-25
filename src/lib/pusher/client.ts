import Pusher from "pusher-js";

console.log("Pusher client config:", {
  key: process.env.NEXT_PUBLIC_PUSHER_KEY ? "SET" : "MISSING",
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ? "SET" : "MISSING",
});

export const pusherClient = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  forceTLS: true,
});

// Add connection logging
pusherClient.connection.bind("connected", () => {
  console.log("Pusher client connected");
});

pusherClient.connection.bind("error", (err: any) => {
  console.error("Pusher connection error:", err);
});
