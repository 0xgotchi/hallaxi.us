import { useWebSocketProgress } from "./useWebSocketProgress";

export function useUploadProgress(
  fileId: string | null,
  enabled: boolean = true,
) {
  return useWebSocketProgress(fileId, enabled);
}

export default useUploadProgress;
