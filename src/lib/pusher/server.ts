import Pusher from "pusher";

console.log("Pusher config:", {
  appId: process.env.PUSHER_APP_ID ? "SET" : "MISSING",
  key: process.env.PUSHER_KEY ? "SET" : "MISSING",
  secret: process.env.PUSHER_SECRET ? "SET" : "MISSING",
  cluster: process.env.PUSHER_CLUSTER ? "SET" : "MISSING",
});

export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});
