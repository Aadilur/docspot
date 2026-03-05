declare const React: any;
declare const AdminJS: any;
declare const AdminJSDesignSystem: any;
declare const window: any;

type ChatMessage = {
  id: string;
  applicationId: string;
  senderRole: "user" | "admin";
  message: string;
  createdAt: string;
};

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getResourceIdFromPathname(pathname: string): string {
  const m = pathname.match(/\/resources\/([^/]+)/);
  return m && typeof m[1] === "string" ? safeDecodeURIComponent(m[1]) : "";
}

function getRecordIdFromPathname(pathname: string): string {
  const m = pathname.match(/\/records\/([^/]+)/);
  return m && typeof m[1] === "string" ? safeDecodeURIComponent(m[1]) : "";
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function mergeMessages(
  existing: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) {
    if (m && typeof m.id === "string") byId.set(m.id, m);
  }
  const out = Array.from(byId.values());
  out.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return out;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(t);
        resolve(value);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

const { Box, Button, DrawerContent, Icon, Loader, Text, TextArea } =
  AdminJSDesignSystem;

const { createElement, useCallback, useEffect, useMemo, useRef, useState } =
  React;

const CareerApplicationChat = (props: any) => {
  const { resource, record } = props;
  const addNotice = AdminJS.useNotice();
  const api = useMemo(() => new AdminJS.ApiClient(), []);

  const pathname = String(window?.location?.pathname || "");
  const resourceIdFromPath = getResourceIdFromPathname(pathname);
  const recordIdFromPath = getRecordIdFromPathname(pathname);

  const resourceId =
    (typeof resource?.id === "string" && resource.id.trim()) ||
    (typeof props?.resourceId === "string" && props.resourceId.trim()) ||
    resourceIdFromPath ||
    undefined;

  const recordId =
    (typeof record?.id === "string" && record.id.trim()) ||
    (typeof record?.params?.id === "string" && record.params.id.trim()) ||
    (typeof props?.recordId === "string" && props.recordId.trim()) ||
    (typeof props?.match?.params?.recordId === "string" &&
      props.match.params.recordId.trim()) ||
    recordIdFromPath ||
    undefined;

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([] as ChatMessage[]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null as any);

  const canDownloadCv = useMemo(() => {
    const actions: Array<any> = Array.isArray(record?.recordActions)
      ? record.recordActions
      : [];
    return actions.some((a) => a?.name === "downloadCv");
  }, [record]);

  const scrollToBottom = useCallback(() => {
    try {
      messagesEndRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "end",
      });
    } catch {
      // ignore
    }
  }, []);

  const loadInitial = useCallback(async () => {
    if (!resourceId || !recordId) {
      // Avoid an infinite spinner if AdminJS hasn't provided the record yet.
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const resp: any = await withTimeout(
        api.recordAction({
          resourceId,
          recordId,
          actionName: "openChat",
          data: { op: "list" },
        }) as any,
        15_000,
        "Loading chat",
      );
      if (resp?.data?.notice) {
        addNotice(resp.data.notice);
      }
      const msgs = Array.isArray(resp?.data?.messages)
        ? (resp.data.messages as ChatMessage[])
        : [];
      setMessages(msgs);
      setTimeout(scrollToBottom, 50);
    } catch (e: any) {
      const message = e instanceof Error ? e.message : "Failed to load chat";
      addNotice({ message, type: "error" });
    } finally {
      setLoading(false);
    }
  }, [addNotice, api, recordId, resourceId, scrollToBottom]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const handleRefresh = useCallback(() => {
    void loadInitial();
  }, [loadInitial]);

  const handleDownloadCv = useCallback(async () => {
    if (!resourceId || !recordId) return;

    try {
      const resp = await api.recordAction({
        resourceId,
        recordId,
        actionName: "downloadCv",
        data: { op: "download" },
      });
      if (resp?.data?.notice) {
        addNotice(resp.data.notice);
      }
      const url = resp?.data?.redirectUrl;
      if (typeof url === "string" && url) {
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) window.location.href = url;
        return;
      }
      addNotice({ message: "No CV available", type: "error" });
    } catch (e: any) {
      const message = e instanceof Error ? e.message : "Failed to download CV";
      addNotice({ message, type: "error" });
    }
  }, [addNotice, api, recordId, resourceId]);

  const handleSend = useCallback(async () => {
    if (!resourceId || !recordId) return;

    const message = draft.trim();
    if (!message) return;

    setSending(true);
    try {
      const resp = await api.recordAction({
        resourceId,
        recordId,
        actionName: "openChat",
        data: { message },
      });
      if (resp?.data?.notice) {
        addNotice(resp.data.notice);
      }
      const created = resp?.data?.message as ChatMessage | undefined;
      if (created && typeof created.id === "string") {
        setMessages((prev: ChatMessage[]) => mergeMessages(prev, [created]));
        setDraft("");
        setTimeout(scrollToBottom, 0);
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : "Failed to send message";
      addNotice({ message: msg, type: "error" });
    } finally {
      setSending(false);
    }
  }, [addNotice, api, draft, recordId, resourceId, scrollToBottom]);

  const header = createElement(
    Box,
    {
      flex: true,
      justifyContent: "space-between",
      mb: "xl",
      alignItems: "center",
    },
    createElement(Text, { fontWeight: "bold" }, "Chat"),
    createElement(
      Box,
      { style: { display: "flex", gap: 8 } },
      createElement(
        Button,
        { variant: "outlined", onClick: handleRefresh, disabled: loading },
        "Refresh",
      ),
      canDownloadCv
        ? createElement(
            Button,
            { variant: "outlined", onClick: handleDownloadCv },
            "Download CV",
          )
        : null,
    ),
  );

  const body = loading
    ? createElement(
        Box,
        { py: "xxl", textAlign: "center" },
        createElement(Loader, null),
      )
    : createElement(
        Box,
        {
          border: "default",
          variant: "white",
          p: "lg",
          style: { maxHeight: "60vh", overflowY: "auto" },
        },
        messages.length === 0
          ? createElement(Text, null, "— No messages —")
          : messages.map((m: ChatMessage) =>
              createElement(
                Box,
                {
                  key: m.id,
                  mb: "default",
                  p: "default",
                  border: "default",
                  borderRadius: "default",
                },
                createElement(
                  Text,
                  { fontSize: "sm", mb: "sm" },
                  createElement("strong", null, m.senderRole),
                  " · ",
                  formatTimestamp(m.createdAt),
                ),
                createElement(Text, null, m.message),
              ),
            ),
        createElement("div", { ref: messagesEndRef }),
      );

  const composer = createElement(
    Box,
    { mt: "xl" },
    createElement(TextArea, {
      value: draft,
      onChange: (e: any) => setDraft(String(e?.target?.value ?? "")),
      placeholder: "Type a message…",
      disabled: sending,
    }),
    createElement(
      Box,
      { mt: "default", flex: true },
      createElement(
        Button,
        {
          variant: "contained",
          onClick: handleSend,
          disabled: sending || draft.trim().length === 0,
        },
        sending ? createElement(Icon, { icon: "Loader", spin: true }) : null,
        "Send",
      ),
    ),
  );

  return createElement(DrawerContent, null, header, body, composer);
};

export default CareerApplicationChat;
