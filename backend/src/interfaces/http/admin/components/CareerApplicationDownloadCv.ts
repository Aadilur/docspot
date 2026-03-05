declare const React: any;
declare const AdminJS: any;
declare const AdminJSDesignSystem: any;
declare const window: any;

type DownloadResp = {
  redirectUrl?: string;
  notice?: { type: "error" | "success" | "info"; message: string };
};

const { Box, Button, Icon, Loader, Text } = AdminJSDesignSystem;
const { createElement, useCallback, useMemo, useState } = React;

const CareerApplicationDownloadCv = (props: any) => {
  const { resource, record } = props;
  const addNotice = AdminJS.useNotice();
  const api = useMemo(() => new AdminJS.ApiClient(), []);

  const resourceId = resource?.id as string | undefined;
  const recordId = record?.id as string | undefined;

  const [loading, setLoading] = useState(false);

  const openInNewTab = useCallback(async () => {
    if (!resourceId || !recordId) return;

    setLoading(true);
    try {
      const resp = await api.recordAction({
        resourceId,
        recordId,
        actionName: "downloadCv",
        data: { op: "download" },
      });

      const data = (resp?.data ?? {}) as DownloadResp;
      if (data.notice) addNotice(data.notice);

      const url = typeof data.redirectUrl === "string" ? data.redirectUrl : "";
      if (!url) {
        addNotice({ message: "No CV available", type: "error" });
        return;
      }

      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        // Fallback if popup blocked.
        window.location.href = url;
      }
    } catch (e: any) {
      const message = e instanceof Error ? e.message : "Failed to download CV";
      addNotice({ message, type: "error" });
    } finally {
      setLoading(false);
    }
  }, [addNotice, api, recordId, resourceId]);

  return createElement(
    Box,
    { variant: "white", border: "default", p: "xl" },
    createElement(Text, { fontWeight: "bold", mb: "default" }, "Download CV"),
    createElement(
      Text,
      { mb: "xl" },
      "This opens the candidate's CV in a new tab.",
    ),
    createElement(
      Button,
      { variant: "contained", onClick: openInNewTab, disabled: loading },
      loading ? createElement(Loader, { size: 14 }) : null,
      loading ? "Opening…" : "Open CV in new tab",
      loading ? null : createElement(Icon, { icon: "ExternalLink" }),
    ),
  );
};

export default CareerApplicationDownloadCv;
