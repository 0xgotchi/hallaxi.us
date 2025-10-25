import { useState, useEffect, useRef } from "react";
import { pusherClient } from "@/lib/pusher/client";

export function usePusherChannel(channelName: string | null) {
  const [channel, setChannel] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    setError(null);

    if (!channelName) {
      setChannel(null);
      return;
    }

    if (!pusherClient) {
      setError("Pusher client not available");
      return;
    }

    try {
      const newChannel = pusherClient.subscribe(channelName);
      channelRef.current = newChannel;
      setChannel(newChannel);

      newChannel.bind("pusher:subscription_succeeded", () => {
        console.log(`Subscribed to ${channelName}`);
      });

      newChannel.bind("pusher:subscription_error", (err: any) => {
        setError(`Subscription failed: ${err}`);
      });
    } catch (err) {
      setError(`Failed to subscribe: ${err}`);
    }

    return () => {
      if (channelRef.current && pusherClient) {
        try {
          pusherClient.unsubscribe(channelName);
        } catch (err) {
          console.error("Error unsubscribing:", err);
        }
        channelRef.current = null;
        setChannel(null);
      }
    };
  }, [channelName]);

  return { channel, error };
}
