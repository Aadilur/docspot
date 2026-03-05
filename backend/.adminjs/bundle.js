(function (designSystem, adminjs, React$1) {
  'use strict';

  function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

  var React__default = /*#__PURE__*/_interopDefault(React$1);

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  function getResourceIdFromPathname(pathname) {
    const m = pathname.match(/\/resources\/([^/]+)/);
    return m && typeof m[1] === "string" ? safeDecodeURIComponent(m[1]) : "";
  }
  function getRecordIdFromPathname(pathname) {
    const m = pathname.match(/\/records\/([^/]+)/);
    return m && typeof m[1] === "string" ? safeDecodeURIComponent(m[1]) : "";
  }
  function formatTimestamp(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }
  function mergeMessages(existing, incoming) {
    const byId = new Map();
    for (const m of existing) byId.set(m.id, m);
    for (const m of incoming) {
      if (m && typeof m.id === "string") byId.set(m.id, m);
    }
    const out = Array.from(byId.values());
    out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return out;
  }
  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        reject(new Error(`${label} timed out`));
      }, ms);
      promise.then(value => {
        clearTimeout(t);
        resolve(value);
      }, err => {
        clearTimeout(t);
        reject(err);
      });
    });
  }
  const {
    Box: Box$1,
    Button: Button$1,
    DrawerContent,
    Icon: Icon$1,
    Loader: Loader$1,
    Text: Text$1,
    TextArea
  } = AdminJSDesignSystem;
  const {
    createElement: createElement$1,
    useCallback: useCallback$1,
    useEffect,
    useMemo: useMemo$1,
    useRef,
    useState: useState$1
  } = React;
  const CareerApplicationChat = props => {
    const {
      resource,
      record
    } = props;
    const addNotice = AdminJS.useNotice();
    const api = useMemo$1(() => new AdminJS.ApiClient(), []);
    const pathname = String(window?.location?.pathname || "");
    const resourceIdFromPath = getResourceIdFromPathname(pathname);
    const recordIdFromPath = getRecordIdFromPathname(pathname);
    const resourceId = typeof resource?.id === "string" && resource.id.trim() || typeof props?.resourceId === "string" && props.resourceId.trim() || resourceIdFromPath || undefined;
    const recordId = typeof record?.id === "string" && record.id.trim() || typeof record?.params?.id === "string" && record.params.id.trim() || typeof props?.recordId === "string" && props.recordId.trim() || typeof props?.match?.params?.recordId === "string" && props.match.params.recordId.trim() || recordIdFromPath || undefined;
    const [loading, setLoading] = useState$1(true);
    const [messages, setMessages] = useState$1([]);
    const [draft, setDraft] = useState$1("");
    const [sending, setSending] = useState$1(false);
    const messagesEndRef = useRef(null);
    const canDownloadCv = useMemo$1(() => {
      const actions = Array.isArray(record?.recordActions) ? record.recordActions : [];
      return actions.some(a => a?.name === "downloadCv");
    }, [record]);
    const scrollToBottom = useCallback$1(() => {
      try {
        messagesEndRef.current?.scrollIntoView?.({
          behavior: "smooth",
          block: "end"
        });
      } catch {
        // ignore
      }
    }, []);
    const loadInitial = useCallback$1(async () => {
      if (!resourceId || !recordId) {
        // Avoid an infinite spinner if AdminJS hasn't provided the record yet.
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const resp = await withTimeout(api.recordAction({
          resourceId,
          recordId,
          actionName: "openChat",
          data: {
            op: "list"
          }
        }), 15_000, "Loading chat");
        if (resp?.data?.notice) {
          addNotice(resp.data.notice);
        }
        const msgs = Array.isArray(resp?.data?.messages) ? resp.data.messages : [];
        setMessages(msgs);
        setTimeout(scrollToBottom, 50);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load chat";
        addNotice({
          message,
          type: "error"
        });
      } finally {
        setLoading(false);
      }
    }, [addNotice, api, recordId, resourceId, scrollToBottom]);
    useEffect(() => {
      void loadInitial();
    }, [loadInitial]);
    const handleRefresh = useCallback$1(() => {
      void loadInitial();
    }, [loadInitial]);
    const handleDownloadCv = useCallback$1(async () => {
      if (!resourceId || !recordId) return;
      try {
        const resp = await api.recordAction({
          resourceId,
          recordId,
          actionName: "downloadCv",
          data: {
            op: "download"
          }
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
        addNotice({
          message: "No CV available",
          type: "error"
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to download CV";
        addNotice({
          message,
          type: "error"
        });
      }
    }, [addNotice, api, recordId, resourceId]);
    const handleSend = useCallback$1(async () => {
      if (!resourceId || !recordId) return;
      const message = draft.trim();
      if (!message) return;
      setSending(true);
      try {
        const resp = await api.recordAction({
          resourceId,
          recordId,
          actionName: "openChat",
          data: {
            message
          }
        });
        if (resp?.data?.notice) {
          addNotice(resp.data.notice);
        }
        const created = resp?.data?.message;
        if (created && typeof created.id === "string") {
          setMessages(prev => mergeMessages(prev, [created]));
          setDraft("");
          setTimeout(scrollToBottom, 0);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to send message";
        addNotice({
          message: msg,
          type: "error"
        });
      } finally {
        setSending(false);
      }
    }, [addNotice, api, draft, recordId, resourceId, scrollToBottom]);
    const header = createElement$1(Box$1, {
      flex: true,
      justifyContent: "space-between",
      mb: "xl",
      alignItems: "center"
    }, createElement$1(Text$1, {
      fontWeight: "bold"
    }, "Chat"), createElement$1(Box$1, {
      style: {
        display: "flex",
        gap: 8
      }
    }, createElement$1(Button$1, {
      variant: "outlined",
      onClick: handleRefresh,
      disabled: loading
    }, "Refresh"), canDownloadCv ? createElement$1(Button$1, {
      variant: "outlined",
      onClick: handleDownloadCv
    }, "Download CV") : null));
    const body = loading ? createElement$1(Box$1, {
      py: "xxl",
      textAlign: "center"
    }, createElement$1(Loader$1, null)) : createElement$1(Box$1, {
      border: "default",
      variant: "white",
      p: "lg",
      style: {
        maxHeight: "60vh",
        overflowY: "auto"
      }
    }, messages.length === 0 ? createElement$1(Text$1, null, "— No messages —") : messages.map(m => createElement$1(Box$1, {
      key: m.id,
      mb: "default",
      p: "default",
      border: "default",
      borderRadius: "default"
    }, createElement$1(Text$1, {
      fontSize: "sm",
      mb: "sm"
    }, createElement$1("strong", null, m.senderRole), " · ", formatTimestamp(m.createdAt)), createElement$1(Text$1, null, m.message))), createElement$1("div", {
      ref: messagesEndRef
    }));
    const composer = createElement$1(Box$1, {
      mt: "xl"
    }, createElement$1(TextArea, {
      value: draft,
      onChange: e => setDraft(String(e?.target?.value ?? "")),
      placeholder: "Type a message…",
      disabled: sending
    }), createElement$1(Box$1, {
      mt: "default",
      flex: true
    }, createElement$1(Button$1, {
      variant: "contained",
      onClick: handleSend,
      disabled: sending || draft.trim().length === 0
    }, sending ? createElement$1(Icon$1, {
      icon: "Loader",
      spin: true
    }) : null, "Send")));
    return createElement$1(DrawerContent, null, header, body, composer);
  };

  const {
    Box,
    Button,
    Icon,
    Loader,
    Text
  } = AdminJSDesignSystem;
  const {
    createElement,
    useCallback,
    useMemo,
    useState
  } = React;
  const CareerApplicationDownloadCv = props => {
    const {
      resource,
      record
    } = props;
    const addNotice = AdminJS.useNotice();
    const api = useMemo(() => new AdminJS.ApiClient(), []);
    const resourceId = resource?.id;
    const recordId = record?.id;
    const [loading, setLoading] = useState(false);
    const openInNewTab = useCallback(async () => {
      if (!resourceId || !recordId) return;
      setLoading(true);
      try {
        const resp = await api.recordAction({
          resourceId,
          recordId,
          actionName: "downloadCv",
          data: {
            op: "download"
          }
        });
        const data = resp?.data ?? {};
        if (data.notice) addNotice(data.notice);
        const url = typeof data.redirectUrl === "string" ? data.redirectUrl : "";
        if (!url) {
          addNotice({
            message: "No CV available",
            type: "error"
          });
          return;
        }
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) {
          // Fallback if popup blocked.
          window.location.href = url;
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to download CV";
        addNotice({
          message,
          type: "error"
        });
      } finally {
        setLoading(false);
      }
    }, [addNotice, api, recordId, resourceId]);
    return createElement(Box, {
      variant: "white",
      border: "default",
      p: "xl"
    }, createElement(Text, {
      fontWeight: "bold",
      mb: "default"
    }, "Download CV"), createElement(Text, {
      mb: "xl"
    }, "This opens the candidate's CV in a new tab."), createElement(Button, {
      variant: "contained",
      onClick: openInNewTab,
      disabled: loading
    }, loading ? createElement(Loader, {
      size: 14
    }) : null, loading ? "Opening…" : "Open CV in new tab", loading ? null : createElement(Icon, {
      icon: "ExternalLink"
    })));
  };

  const Edit = ({
    property,
    record,
    onChange
  }) => {
    const {
      translateProperty
    } = adminjs.useTranslation();
    const {
      params
    } = record;
    const {
      custom
    } = property;
    const path = adminjs.flat.get(params, custom.filePathProperty);
    const key = adminjs.flat.get(params, custom.keyProperty);
    const file = adminjs.flat.get(params, custom.fileProperty);
    const [originalKey, setOriginalKey] = React$1.useState(key);
    const [filesToUpload, setFilesToUpload] = React$1.useState([]);
    React$1.useEffect(() => {
      // it means means that someone hit save and new file has been uploaded
      // in this case fliesToUpload should be cleared.
      // This happens when user turns off redirect after new/edit
      if (typeof key === 'string' && key !== originalKey || typeof key !== 'string' && !originalKey || typeof key !== 'string' && Array.isArray(key) && key.length !== originalKey.length) {
        setOriginalKey(key);
        setFilesToUpload([]);
      }
    }, [key, originalKey]);
    const onUpload = files => {
      setFilesToUpload(files);
      onChange(custom.fileProperty, files);
    };
    const handleRemove = () => {
      onChange(custom.fileProperty, null);
    };
    const handleMultiRemove = singleKey => {
      const index = (adminjs.flat.get(record.params, custom.keyProperty) || []).indexOf(singleKey);
      const filesToDelete = adminjs.flat.get(record.params, custom.filesToDeleteProperty) || [];
      if (path && path.length > 0) {
        const newPath = path.map((currentPath, i) => i !== index ? currentPath : null);
        let newParams = adminjs.flat.set(record.params, custom.filesToDeleteProperty, [...filesToDelete, index]);
        newParams = adminjs.flat.set(newParams, custom.filePathProperty, newPath);
        onChange({
          ...record,
          params: newParams
        });
      } else {
        // eslint-disable-next-line no-console
        console.log('You cannot remove file when there are no uploaded files yet');
      }
    };
    return /*#__PURE__*/React__default.default.createElement(designSystem.FormGroup, null, /*#__PURE__*/React__default.default.createElement(designSystem.Label, null, translateProperty(property.label, property.resourceId)), /*#__PURE__*/React__default.default.createElement(designSystem.DropZone, {
      onChange: onUpload,
      multiple: custom.multiple,
      validate: {
        mimeTypes: custom.mimeTypes,
        maxSize: custom.maxSize
      },
      files: filesToUpload
    }), !custom.multiple && key && path && !filesToUpload.length && file !== null && (/*#__PURE__*/React__default.default.createElement(designSystem.DropZoneItem, {
      filename: key,
      src: path,
      onRemove: handleRemove
    })), custom.multiple && key && key.length && path ? (/*#__PURE__*/React__default.default.createElement(React__default.default.Fragment, null, key.map((singleKey, index) => {
      // when we remove items we set only path index to nulls.
      // key is still there. This is because
      // we have to maintain all the indexes. So here we simply filter out elements which
      // were removed and display only what was left
      const currentPath = path[index];
      return currentPath ? (/*#__PURE__*/React__default.default.createElement(designSystem.DropZoneItem, {
        key: singleKey,
        filename: singleKey,
        src: path[index],
        onRemove: () => handleMultiRemove(singleKey)
      })) : '';
    }))) : '');
  };

  const AudioMimeTypes = ['audio/aac', 'audio/midi', 'audio/x-midi', 'audio/mpeg', 'audio/ogg', 'application/ogg', 'audio/opus', 'audio/wav', 'audio/webm', 'audio/3gpp2'];
  const ImageMimeTypes = ['image/bmp', 'image/gif', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/vnd.microsoft.icon', 'image/tiff', 'image/webp'];

  // eslint-disable-next-line import/no-extraneous-dependencies
  const SingleFile = props => {
    const {
      name,
      path,
      mimeType,
      width
    } = props;
    if (path && path.length) {
      if (mimeType && ImageMimeTypes.includes(mimeType)) {
        return /*#__PURE__*/React__default.default.createElement("img", {
          src: path,
          style: {
            maxHeight: width,
            maxWidth: width
          },
          alt: name
        });
      }
      if (mimeType && AudioMimeTypes.includes(mimeType)) {
        return /*#__PURE__*/React__default.default.createElement("audio", {
          controls: true,
          src: path
        }, "Your browser does not support the", /*#__PURE__*/React__default.default.createElement("code", null, "audio"), /*#__PURE__*/React__default.default.createElement("track", {
          kind: "captions"
        }));
      }
    }
    return /*#__PURE__*/React__default.default.createElement(designSystem.Box, null, /*#__PURE__*/React__default.default.createElement(designSystem.Button, {
      as: "a",
      href: path,
      ml: "default",
      size: "sm",
      rounded: true,
      target: "_blank"
    }, /*#__PURE__*/React__default.default.createElement(designSystem.Icon, {
      icon: "DocumentDownload",
      color: "white",
      mr: "default"
    }), name));
  };
  const File = ({
    width,
    record,
    property
  }) => {
    const {
      custom
    } = property;
    let path = adminjs.flat.get(record?.params, custom.filePathProperty);
    if (!path) {
      return null;
    }
    const name = adminjs.flat.get(record?.params, custom.fileNameProperty ? custom.fileNameProperty : custom.keyProperty);
    const mimeType = custom.mimeTypeProperty && adminjs.flat.get(record?.params, custom.mimeTypeProperty);
    if (!property.custom.multiple) {
      if (custom.opts && custom.opts.baseUrl) {
        path = `${custom.opts.baseUrl}/${name}`;
      }
      return /*#__PURE__*/React__default.default.createElement(SingleFile, {
        path: path,
        name: name,
        width: width,
        mimeType: mimeType
      });
    }
    if (custom.opts && custom.opts.baseUrl) {
      const baseUrl = custom.opts.baseUrl || '';
      path = path.map((singlePath, index) => `${baseUrl}/${name[index]}`);
    }
    return /*#__PURE__*/React__default.default.createElement(React__default.default.Fragment, null, path.map((singlePath, index) => (/*#__PURE__*/React__default.default.createElement(SingleFile, {
      key: singlePath,
      path: singlePath,
      name: name[index],
      width: width,
      mimeType: mimeType[index]
    }))));
  };

  const List = props => (/*#__PURE__*/React__default.default.createElement(File, {
    width: 100,
    ...props
  }));

  const Show = props => {
    const {
      property
    } = props;
    const {
      translateProperty
    } = adminjs.useTranslation();
    return /*#__PURE__*/React__default.default.createElement(designSystem.FormGroup, null, /*#__PURE__*/React__default.default.createElement(designSystem.Label, null, translateProperty(property.label, property.resourceId)), /*#__PURE__*/React__default.default.createElement(File, {
      width: "100%",
      ...props
    }));
  };

  AdminJS.UserComponents = {};
  AdminJS.UserComponents.CareerApplicationChat = CareerApplicationChat;
  AdminJS.UserComponents.CareerApplicationDownloadCv = CareerApplicationDownloadCv;
  AdminJS.UserComponents.UploadEditComponent = Edit;
  AdminJS.UserComponents.UploadListComponent = List;
  AdminJS.UserComponents.UploadShowComponent = Show;

})(AdminJSDesignSystem, AdminJS, React);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVuZGxlLmpzIiwic291cmNlcyI6WyIuLi9zcmMvaW50ZXJmYWNlcy9odHRwL2FkbWluL2NvbXBvbmVudHMvQ2FyZWVyQXBwbGljYXRpb25DaGF0LnRzIiwiLi4vc3JjL2ludGVyZmFjZXMvaHR0cC9hZG1pbi9jb21wb25lbnRzL0NhcmVlckFwcGxpY2F0aW9uRG93bmxvYWRDdi50cyIsIi4uLy4uL25vZGVfbW9kdWxlcy9AYWRtaW5qcy91cGxvYWQvYnVpbGQvZmVhdHVyZXMvdXBsb2FkLWZpbGUvY29tcG9uZW50cy9VcGxvYWRFZGl0Q29tcG9uZW50LmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL0BhZG1pbmpzL3VwbG9hZC9idWlsZC9mZWF0dXJlcy91cGxvYWQtZmlsZS90eXBlcy9taW1lLXR5cGVzLnR5cGUuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvQGFkbWluanMvdXBsb2FkL2J1aWxkL2ZlYXR1cmVzL3VwbG9hZC1maWxlL2NvbXBvbmVudHMvZmlsZS5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9AYWRtaW5qcy91cGxvYWQvYnVpbGQvZmVhdHVyZXMvdXBsb2FkLWZpbGUvY29tcG9uZW50cy9VcGxvYWRMaXN0Q29tcG9uZW50LmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL0BhZG1pbmpzL3VwbG9hZC9idWlsZC9mZWF0dXJlcy91cGxvYWQtZmlsZS9jb21wb25lbnRzL1VwbG9hZFNob3dDb21wb25lbnQuanMiLCJlbnRyeS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJkZWNsYXJlIGNvbnN0IFJlYWN0OiBhbnk7XG5kZWNsYXJlIGNvbnN0IEFkbWluSlM6IGFueTtcbmRlY2xhcmUgY29uc3QgQWRtaW5KU0Rlc2lnblN5c3RlbTogYW55O1xuZGVjbGFyZSBjb25zdCB3aW5kb3c6IGFueTtcblxudHlwZSBDaGF0TWVzc2FnZSA9IHtcbiAgaWQ6IHN0cmluZztcbiAgYXBwbGljYXRpb25JZDogc3RyaW5nO1xuICBzZW5kZXJSb2xlOiBcInVzZXJcIiB8IFwiYWRtaW5cIjtcbiAgbWVzc2FnZTogc3RyaW5nO1xuICBjcmVhdGVkQXQ6IHN0cmluZztcbn07XG5cbmZ1bmN0aW9uIHNhZmVEZWNvZGVVUklDb21wb25lbnQodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudCh2YWx1ZSk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRSZXNvdXJjZUlkRnJvbVBhdGhuYW1lKHBhdGhuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBtID0gcGF0aG5hbWUubWF0Y2goL1xcL3Jlc291cmNlc1xcLyhbXi9dKykvKTtcbiAgcmV0dXJuIG0gJiYgdHlwZW9mIG1bMV0gPT09IFwic3RyaW5nXCIgPyBzYWZlRGVjb2RlVVJJQ29tcG9uZW50KG1bMV0pIDogXCJcIjtcbn1cblxuZnVuY3Rpb24gZ2V0UmVjb3JkSWRGcm9tUGF0aG5hbWUocGF0aG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IG0gPSBwYXRobmFtZS5tYXRjaCgvXFwvcmVjb3Jkc1xcLyhbXi9dKykvKTtcbiAgcmV0dXJuIG0gJiYgdHlwZW9mIG1bMV0gPT09IFwic3RyaW5nXCIgPyBzYWZlRGVjb2RlVVJJQ29tcG9uZW50KG1bMV0pIDogXCJcIjtcbn1cblxuZnVuY3Rpb24gZm9ybWF0VGltZXN0YW1wKGlzbzogc3RyaW5nKTogc3RyaW5nIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBkID0gbmV3IERhdGUoaXNvKTtcbiAgICBpZiAoTnVtYmVyLmlzTmFOKGQuZ2V0VGltZSgpKSkgcmV0dXJuIGlzbztcbiAgICByZXR1cm4gZC50b0xvY2FsZVN0cmluZygpO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gaXNvO1xuICB9XG59XG5cbmZ1bmN0aW9uIG1lcmdlTWVzc2FnZXMoXG4gIGV4aXN0aW5nOiBDaGF0TWVzc2FnZVtdLFxuICBpbmNvbWluZzogQ2hhdE1lc3NhZ2VbXSxcbik6IENoYXRNZXNzYWdlW10ge1xuICBjb25zdCBieUlkID0gbmV3IE1hcDxzdHJpbmcsIENoYXRNZXNzYWdlPigpO1xuICBmb3IgKGNvbnN0IG0gb2YgZXhpc3RpbmcpIGJ5SWQuc2V0KG0uaWQsIG0pO1xuICBmb3IgKGNvbnN0IG0gb2YgaW5jb21pbmcpIHtcbiAgICBpZiAobSAmJiB0eXBlb2YgbS5pZCA9PT0gXCJzdHJpbmdcIikgYnlJZC5zZXQobS5pZCwgbSk7XG4gIH1cbiAgY29uc3Qgb3V0ID0gQXJyYXkuZnJvbShieUlkLnZhbHVlcygpKTtcbiAgb3V0LnNvcnQoXG4gICAgKGEsIGIpID0+IG5ldyBEYXRlKGEuY3JlYXRlZEF0KS5nZXRUaW1lKCkgLSBuZXcgRGF0ZShiLmNyZWF0ZWRBdCkuZ2V0VGltZSgpLFxuICApO1xuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiB3aXRoVGltZW91dDxUPihcbiAgcHJvbWlzZTogUHJvbWlzZTxUPixcbiAgbXM6IG51bWJlcixcbiAgbGFiZWw6IHN0cmluZyxcbik6IFByb21pc2U8VD4ge1xuICByZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoYCR7bGFiZWx9IHRpbWVkIG91dGApKTtcbiAgICB9LCBtcyk7XG5cbiAgICBwcm9taXNlLnRoZW4oXG4gICAgICAodmFsdWUpID0+IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHQpO1xuICAgICAgICByZXNvbHZlKHZhbHVlKTtcbiAgICAgIH0sXG4gICAgICAoZXJyKSA9PiB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0KTtcbiAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICB9LFxuICAgICk7XG4gIH0pO1xufVxuXG5jb25zdCB7IEJveCwgQnV0dG9uLCBEcmF3ZXJDb250ZW50LCBJY29uLCBMb2FkZXIsIFRleHQsIFRleHRBcmVhIH0gPVxuICBBZG1pbkpTRGVzaWduU3lzdGVtO1xuXG5jb25zdCB7IGNyZWF0ZUVsZW1lbnQsIHVzZUNhbGxiYWNrLCB1c2VFZmZlY3QsIHVzZU1lbW8sIHVzZVJlZiwgdXNlU3RhdGUgfSA9XG4gIFJlYWN0O1xuXG5jb25zdCBDYXJlZXJBcHBsaWNhdGlvbkNoYXQgPSAocHJvcHM6IGFueSkgPT4ge1xuICBjb25zdCB7IHJlc291cmNlLCByZWNvcmQgfSA9IHByb3BzO1xuICBjb25zdCBhZGROb3RpY2UgPSBBZG1pbkpTLnVzZU5vdGljZSgpO1xuICBjb25zdCBhcGkgPSB1c2VNZW1vKCgpID0+IG5ldyBBZG1pbkpTLkFwaUNsaWVudCgpLCBbXSk7XG5cbiAgY29uc3QgcGF0aG5hbWUgPSBTdHJpbmcod2luZG93Py5sb2NhdGlvbj8ucGF0aG5hbWUgfHwgXCJcIik7XG4gIGNvbnN0IHJlc291cmNlSWRGcm9tUGF0aCA9IGdldFJlc291cmNlSWRGcm9tUGF0aG5hbWUocGF0aG5hbWUpO1xuICBjb25zdCByZWNvcmRJZEZyb21QYXRoID0gZ2V0UmVjb3JkSWRGcm9tUGF0aG5hbWUocGF0aG5hbWUpO1xuXG4gIGNvbnN0IHJlc291cmNlSWQgPVxuICAgICh0eXBlb2YgcmVzb3VyY2U/LmlkID09PSBcInN0cmluZ1wiICYmIHJlc291cmNlLmlkLnRyaW0oKSkgfHxcbiAgICAodHlwZW9mIHByb3BzPy5yZXNvdXJjZUlkID09PSBcInN0cmluZ1wiICYmIHByb3BzLnJlc291cmNlSWQudHJpbSgpKSB8fFxuICAgIHJlc291cmNlSWRGcm9tUGF0aCB8fFxuICAgIHVuZGVmaW5lZDtcblxuICBjb25zdCByZWNvcmRJZCA9XG4gICAgKHR5cGVvZiByZWNvcmQ/LmlkID09PSBcInN0cmluZ1wiICYmIHJlY29yZC5pZC50cmltKCkpIHx8XG4gICAgKHR5cGVvZiByZWNvcmQ/LnBhcmFtcz8uaWQgPT09IFwic3RyaW5nXCIgJiYgcmVjb3JkLnBhcmFtcy5pZC50cmltKCkpIHx8XG4gICAgKHR5cGVvZiBwcm9wcz8ucmVjb3JkSWQgPT09IFwic3RyaW5nXCIgJiYgcHJvcHMucmVjb3JkSWQudHJpbSgpKSB8fFxuICAgICh0eXBlb2YgcHJvcHM/Lm1hdGNoPy5wYXJhbXM/LnJlY29yZElkID09PSBcInN0cmluZ1wiICYmXG4gICAgICBwcm9wcy5tYXRjaC5wYXJhbXMucmVjb3JkSWQudHJpbSgpKSB8fFxuICAgIHJlY29yZElkRnJvbVBhdGggfHxcbiAgICB1bmRlZmluZWQ7XG5cbiAgY29uc3QgW2xvYWRpbmcsIHNldExvYWRpbmddID0gdXNlU3RhdGUodHJ1ZSk7XG4gIGNvbnN0IFttZXNzYWdlcywgc2V0TWVzc2FnZXNdID0gdXNlU3RhdGUoW10gYXMgQ2hhdE1lc3NhZ2VbXSk7XG4gIGNvbnN0IFtkcmFmdCwgc2V0RHJhZnRdID0gdXNlU3RhdGUoXCJcIik7XG4gIGNvbnN0IFtzZW5kaW5nLCBzZXRTZW5kaW5nXSA9IHVzZVN0YXRlKGZhbHNlKTtcblxuICBjb25zdCBtZXNzYWdlc0VuZFJlZiA9IHVzZVJlZihudWxsIGFzIGFueSk7XG5cbiAgY29uc3QgY2FuRG93bmxvYWRDdiA9IHVzZU1lbW8oKCkgPT4ge1xuICAgIGNvbnN0IGFjdGlvbnM6IEFycmF5PGFueT4gPSBBcnJheS5pc0FycmF5KHJlY29yZD8ucmVjb3JkQWN0aW9ucylcbiAgICAgID8gcmVjb3JkLnJlY29yZEFjdGlvbnNcbiAgICAgIDogW107XG4gICAgcmV0dXJuIGFjdGlvbnMuc29tZSgoYSkgPT4gYT8ubmFtZSA9PT0gXCJkb3dubG9hZEN2XCIpO1xuICB9LCBbcmVjb3JkXSk7XG5cbiAgY29uc3Qgc2Nyb2xsVG9Cb3R0b20gPSB1c2VDYWxsYmFjaygoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIG1lc3NhZ2VzRW5kUmVmLmN1cnJlbnQ/LnNjcm9sbEludG9WaWV3Py4oe1xuICAgICAgICBiZWhhdmlvcjogXCJzbW9vdGhcIixcbiAgICAgICAgYmxvY2s6IFwiZW5kXCIsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIGlnbm9yZVxuICAgIH1cbiAgfSwgW10pO1xuXG4gIGNvbnN0IGxvYWRJbml0aWFsID0gdXNlQ2FsbGJhY2soYXN5bmMgKCkgPT4ge1xuICAgIGlmICghcmVzb3VyY2VJZCB8fCAhcmVjb3JkSWQpIHtcbiAgICAgIC8vIEF2b2lkIGFuIGluZmluaXRlIHNwaW5uZXIgaWYgQWRtaW5KUyBoYXNuJ3QgcHJvdmlkZWQgdGhlIHJlY29yZCB5ZXQuXG4gICAgICBzZXRMb2FkaW5nKGZhbHNlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBzZXRMb2FkaW5nKHRydWUpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwOiBhbnkgPSBhd2FpdCB3aXRoVGltZW91dChcbiAgICAgICAgYXBpLnJlY29yZEFjdGlvbih7XG4gICAgICAgICAgcmVzb3VyY2VJZCxcbiAgICAgICAgICByZWNvcmRJZCxcbiAgICAgICAgICBhY3Rpb25OYW1lOiBcIm9wZW5DaGF0XCIsXG4gICAgICAgICAgZGF0YTogeyBvcDogXCJsaXN0XCIgfSxcbiAgICAgICAgfSkgYXMgYW55LFxuICAgICAgICAxNV8wMDAsXG4gICAgICAgIFwiTG9hZGluZyBjaGF0XCIsXG4gICAgICApO1xuICAgICAgaWYgKHJlc3A/LmRhdGE/Lm5vdGljZSkge1xuICAgICAgICBhZGROb3RpY2UocmVzcC5kYXRhLm5vdGljZSk7XG4gICAgICB9XG4gICAgICBjb25zdCBtc2dzID0gQXJyYXkuaXNBcnJheShyZXNwPy5kYXRhPy5tZXNzYWdlcylcbiAgICAgICAgPyAocmVzcC5kYXRhLm1lc3NhZ2VzIGFzIENoYXRNZXNzYWdlW10pXG4gICAgICAgIDogW107XG4gICAgICBzZXRNZXNzYWdlcyhtc2dzKTtcbiAgICAgIHNldFRpbWVvdXQoc2Nyb2xsVG9Cb3R0b20sIDUwKTtcbiAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBcIkZhaWxlZCB0byBsb2FkIGNoYXRcIjtcbiAgICAgIGFkZE5vdGljZSh7IG1lc3NhZ2UsIHR5cGU6IFwiZXJyb3JcIiB9KTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgc2V0TG9hZGluZyhmYWxzZSk7XG4gICAgfVxuICB9LCBbYWRkTm90aWNlLCBhcGksIHJlY29yZElkLCByZXNvdXJjZUlkLCBzY3JvbGxUb0JvdHRvbV0pO1xuXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgdm9pZCBsb2FkSW5pdGlhbCgpO1xuICB9LCBbbG9hZEluaXRpYWxdKTtcblxuICBjb25zdCBoYW5kbGVSZWZyZXNoID0gdXNlQ2FsbGJhY2soKCkgPT4ge1xuICAgIHZvaWQgbG9hZEluaXRpYWwoKTtcbiAgfSwgW2xvYWRJbml0aWFsXSk7XG5cbiAgY29uc3QgaGFuZGxlRG93bmxvYWRDdiA9IHVzZUNhbGxiYWNrKGFzeW5jICgpID0+IHtcbiAgICBpZiAoIXJlc291cmNlSWQgfHwgIXJlY29yZElkKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcCA9IGF3YWl0IGFwaS5yZWNvcmRBY3Rpb24oe1xuICAgICAgICByZXNvdXJjZUlkLFxuICAgICAgICByZWNvcmRJZCxcbiAgICAgICAgYWN0aW9uTmFtZTogXCJkb3dubG9hZEN2XCIsXG4gICAgICAgIGRhdGE6IHsgb3A6IFwiZG93bmxvYWRcIiB9LFxuICAgICAgfSk7XG4gICAgICBpZiAocmVzcD8uZGF0YT8ubm90aWNlKSB7XG4gICAgICAgIGFkZE5vdGljZShyZXNwLmRhdGEubm90aWNlKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVybCA9IHJlc3A/LmRhdGE/LnJlZGlyZWN0VXJsO1xuICAgICAgaWYgKHR5cGVvZiB1cmwgPT09IFwic3RyaW5nXCIgJiYgdXJsKSB7XG4gICAgICAgIGNvbnN0IG9wZW5lZCA9IHdpbmRvdy5vcGVuKHVybCwgXCJfYmxhbmtcIiwgXCJub29wZW5lcixub3JlZmVycmVyXCIpO1xuICAgICAgICBpZiAoIW9wZW5lZCkgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB1cmw7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGFkZE5vdGljZSh7IG1lc3NhZ2U6IFwiTm8gQ1YgYXZhaWxhYmxlXCIsIHR5cGU6IFwiZXJyb3JcIiB9KTtcbiAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBcIkZhaWxlZCB0byBkb3dubG9hZCBDVlwiO1xuICAgICAgYWRkTm90aWNlKHsgbWVzc2FnZSwgdHlwZTogXCJlcnJvclwiIH0pO1xuICAgIH1cbiAgfSwgW2FkZE5vdGljZSwgYXBpLCByZWNvcmRJZCwgcmVzb3VyY2VJZF0pO1xuXG4gIGNvbnN0IGhhbmRsZVNlbmQgPSB1c2VDYWxsYmFjayhhc3luYyAoKSA9PiB7XG4gICAgaWYgKCFyZXNvdXJjZUlkIHx8ICFyZWNvcmRJZCkgcmV0dXJuO1xuXG4gICAgY29uc3QgbWVzc2FnZSA9IGRyYWZ0LnRyaW0oKTtcbiAgICBpZiAoIW1lc3NhZ2UpIHJldHVybjtcblxuICAgIHNldFNlbmRpbmcodHJ1ZSk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3AgPSBhd2FpdCBhcGkucmVjb3JkQWN0aW9uKHtcbiAgICAgICAgcmVzb3VyY2VJZCxcbiAgICAgICAgcmVjb3JkSWQsXG4gICAgICAgIGFjdGlvbk5hbWU6IFwib3BlbkNoYXRcIixcbiAgICAgICAgZGF0YTogeyBtZXNzYWdlIH0sXG4gICAgICB9KTtcbiAgICAgIGlmIChyZXNwPy5kYXRhPy5ub3RpY2UpIHtcbiAgICAgICAgYWRkTm90aWNlKHJlc3AuZGF0YS5ub3RpY2UpO1xuICAgICAgfVxuICAgICAgY29uc3QgY3JlYXRlZCA9IHJlc3A/LmRhdGE/Lm1lc3NhZ2UgYXMgQ2hhdE1lc3NhZ2UgfCB1bmRlZmluZWQ7XG4gICAgICBpZiAoY3JlYXRlZCAmJiB0eXBlb2YgY3JlYXRlZC5pZCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBzZXRNZXNzYWdlcygocHJldjogQ2hhdE1lc3NhZ2VbXSkgPT4gbWVyZ2VNZXNzYWdlcyhwcmV2LCBbY3JlYXRlZF0pKTtcbiAgICAgICAgc2V0RHJhZnQoXCJcIik7XG4gICAgICAgIHNldFRpbWVvdXQoc2Nyb2xsVG9Cb3R0b20sIDApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgICAgY29uc3QgbXNnID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogXCJGYWlsZWQgdG8gc2VuZCBtZXNzYWdlXCI7XG4gICAgICBhZGROb3RpY2UoeyBtZXNzYWdlOiBtc2csIHR5cGU6IFwiZXJyb3JcIiB9KTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgc2V0U2VuZGluZyhmYWxzZSk7XG4gICAgfVxuICB9LCBbYWRkTm90aWNlLCBhcGksIGRyYWZ0LCByZWNvcmRJZCwgcmVzb3VyY2VJZCwgc2Nyb2xsVG9Cb3R0b21dKTtcblxuICBjb25zdCBoZWFkZXIgPSBjcmVhdGVFbGVtZW50KFxuICAgIEJveCxcbiAgICB7XG4gICAgICBmbGV4OiB0cnVlLFxuICAgICAganVzdGlmeUNvbnRlbnQ6IFwic3BhY2UtYmV0d2VlblwiLFxuICAgICAgbWI6IFwieGxcIixcbiAgICAgIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsXG4gICAgfSxcbiAgICBjcmVhdGVFbGVtZW50KFRleHQsIHsgZm9udFdlaWdodDogXCJib2xkXCIgfSwgXCJDaGF0XCIpLFxuICAgIGNyZWF0ZUVsZW1lbnQoXG4gICAgICBCb3gsXG4gICAgICB7IHN0eWxlOiB7IGRpc3BsYXk6IFwiZmxleFwiLCBnYXA6IDggfSB9LFxuICAgICAgY3JlYXRlRWxlbWVudChcbiAgICAgICAgQnV0dG9uLFxuICAgICAgICB7IHZhcmlhbnQ6IFwib3V0bGluZWRcIiwgb25DbGljazogaGFuZGxlUmVmcmVzaCwgZGlzYWJsZWQ6IGxvYWRpbmcgfSxcbiAgICAgICAgXCJSZWZyZXNoXCIsXG4gICAgICApLFxuICAgICAgY2FuRG93bmxvYWRDdlxuICAgICAgICA/IGNyZWF0ZUVsZW1lbnQoXG4gICAgICAgICAgICBCdXR0b24sXG4gICAgICAgICAgICB7IHZhcmlhbnQ6IFwib3V0bGluZWRcIiwgb25DbGljazogaGFuZGxlRG93bmxvYWRDdiB9LFxuICAgICAgICAgICAgXCJEb3dubG9hZCBDVlwiLFxuICAgICAgICAgIClcbiAgICAgICAgOiBudWxsLFxuICAgICksXG4gICk7XG5cbiAgY29uc3QgYm9keSA9IGxvYWRpbmdcbiAgICA/IGNyZWF0ZUVsZW1lbnQoXG4gICAgICAgIEJveCxcbiAgICAgICAgeyBweTogXCJ4eGxcIiwgdGV4dEFsaWduOiBcImNlbnRlclwiIH0sXG4gICAgICAgIGNyZWF0ZUVsZW1lbnQoTG9hZGVyLCBudWxsKSxcbiAgICAgIClcbiAgICA6IGNyZWF0ZUVsZW1lbnQoXG4gICAgICAgIEJveCxcbiAgICAgICAge1xuICAgICAgICAgIGJvcmRlcjogXCJkZWZhdWx0XCIsXG4gICAgICAgICAgdmFyaWFudDogXCJ3aGl0ZVwiLFxuICAgICAgICAgIHA6IFwibGdcIixcbiAgICAgICAgICBzdHlsZTogeyBtYXhIZWlnaHQ6IFwiNjB2aFwiLCBvdmVyZmxvd1k6IFwiYXV0b1wiIH0sXG4gICAgICAgIH0sXG4gICAgICAgIG1lc3NhZ2VzLmxlbmd0aCA9PT0gMFxuICAgICAgICAgID8gY3JlYXRlRWxlbWVudChUZXh0LCBudWxsLCBcIuKAlCBObyBtZXNzYWdlcyDigJRcIilcbiAgICAgICAgICA6IG1lc3NhZ2VzLm1hcCgobTogQ2hhdE1lc3NhZ2UpID0+XG4gICAgICAgICAgICAgIGNyZWF0ZUVsZW1lbnQoXG4gICAgICAgICAgICAgICAgQm94LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgIGtleTogbS5pZCxcbiAgICAgICAgICAgICAgICAgIG1iOiBcImRlZmF1bHRcIixcbiAgICAgICAgICAgICAgICAgIHA6IFwiZGVmYXVsdFwiLFxuICAgICAgICAgICAgICAgICAgYm9yZGVyOiBcImRlZmF1bHRcIixcbiAgICAgICAgICAgICAgICAgIGJvcmRlclJhZGl1czogXCJkZWZhdWx0XCIsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBjcmVhdGVFbGVtZW50KFxuICAgICAgICAgICAgICAgICAgVGV4dCxcbiAgICAgICAgICAgICAgICAgIHsgZm9udFNpemU6IFwic21cIiwgbWI6IFwic21cIiB9LFxuICAgICAgICAgICAgICAgICAgY3JlYXRlRWxlbWVudChcInN0cm9uZ1wiLCBudWxsLCBtLnNlbmRlclJvbGUpLFxuICAgICAgICAgICAgICAgICAgXCIgwrcgXCIsXG4gICAgICAgICAgICAgICAgICBmb3JtYXRUaW1lc3RhbXAobS5jcmVhdGVkQXQpLFxuICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgY3JlYXRlRWxlbWVudChUZXh0LCBudWxsLCBtLm1lc3NhZ2UpLFxuICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgY3JlYXRlRWxlbWVudChcImRpdlwiLCB7IHJlZjogbWVzc2FnZXNFbmRSZWYgfSksXG4gICAgICApO1xuXG4gIGNvbnN0IGNvbXBvc2VyID0gY3JlYXRlRWxlbWVudChcbiAgICBCb3gsXG4gICAgeyBtdDogXCJ4bFwiIH0sXG4gICAgY3JlYXRlRWxlbWVudChUZXh0QXJlYSwge1xuICAgICAgdmFsdWU6IGRyYWZ0LFxuICAgICAgb25DaGFuZ2U6IChlOiBhbnkpID0+IHNldERyYWZ0KFN0cmluZyhlPy50YXJnZXQ/LnZhbHVlID8/IFwiXCIpKSxcbiAgICAgIHBsYWNlaG9sZGVyOiBcIlR5cGUgYSBtZXNzYWdl4oCmXCIsXG4gICAgICBkaXNhYmxlZDogc2VuZGluZyxcbiAgICB9KSxcbiAgICBjcmVhdGVFbGVtZW50KFxuICAgICAgQm94LFxuICAgICAgeyBtdDogXCJkZWZhdWx0XCIsIGZsZXg6IHRydWUgfSxcbiAgICAgIGNyZWF0ZUVsZW1lbnQoXG4gICAgICAgIEJ1dHRvbixcbiAgICAgICAge1xuICAgICAgICAgIHZhcmlhbnQ6IFwiY29udGFpbmVkXCIsXG4gICAgICAgICAgb25DbGljazogaGFuZGxlU2VuZCxcbiAgICAgICAgICBkaXNhYmxlZDogc2VuZGluZyB8fCBkcmFmdC50cmltKCkubGVuZ3RoID09PSAwLFxuICAgICAgICB9LFxuICAgICAgICBzZW5kaW5nID8gY3JlYXRlRWxlbWVudChJY29uLCB7IGljb246IFwiTG9hZGVyXCIsIHNwaW46IHRydWUgfSkgOiBudWxsLFxuICAgICAgICBcIlNlbmRcIixcbiAgICAgICksXG4gICAgKSxcbiAgKTtcblxuICByZXR1cm4gY3JlYXRlRWxlbWVudChEcmF3ZXJDb250ZW50LCBudWxsLCBoZWFkZXIsIGJvZHksIGNvbXBvc2VyKTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IENhcmVlckFwcGxpY2F0aW9uQ2hhdDtcbiIsImRlY2xhcmUgY29uc3QgUmVhY3Q6IGFueTtcbmRlY2xhcmUgY29uc3QgQWRtaW5KUzogYW55O1xuZGVjbGFyZSBjb25zdCBBZG1pbkpTRGVzaWduU3lzdGVtOiBhbnk7XG5kZWNsYXJlIGNvbnN0IHdpbmRvdzogYW55O1xuXG50eXBlIERvd25sb2FkUmVzcCA9IHtcbiAgcmVkaXJlY3RVcmw/OiBzdHJpbmc7XG4gIG5vdGljZT86IHsgdHlwZTogXCJlcnJvclwiIHwgXCJzdWNjZXNzXCIgfCBcImluZm9cIjsgbWVzc2FnZTogc3RyaW5nIH07XG59O1xuXG5jb25zdCB7IEJveCwgQnV0dG9uLCBJY29uLCBMb2FkZXIsIFRleHQgfSA9IEFkbWluSlNEZXNpZ25TeXN0ZW07XG5jb25zdCB7IGNyZWF0ZUVsZW1lbnQsIHVzZUNhbGxiYWNrLCB1c2VNZW1vLCB1c2VTdGF0ZSB9ID0gUmVhY3Q7XG5cbmNvbnN0IENhcmVlckFwcGxpY2F0aW9uRG93bmxvYWRDdiA9IChwcm9wczogYW55KSA9PiB7XG4gIGNvbnN0IHsgcmVzb3VyY2UsIHJlY29yZCB9ID0gcHJvcHM7XG4gIGNvbnN0IGFkZE5vdGljZSA9IEFkbWluSlMudXNlTm90aWNlKCk7XG4gIGNvbnN0IGFwaSA9IHVzZU1lbW8oKCkgPT4gbmV3IEFkbWluSlMuQXBpQ2xpZW50KCksIFtdKTtcblxuICBjb25zdCByZXNvdXJjZUlkID0gcmVzb3VyY2U/LmlkIGFzIHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgY29uc3QgcmVjb3JkSWQgPSByZWNvcmQ/LmlkIGFzIHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICBjb25zdCBbbG9hZGluZywgc2V0TG9hZGluZ10gPSB1c2VTdGF0ZShmYWxzZSk7XG5cbiAgY29uc3Qgb3BlbkluTmV3VGFiID0gdXNlQ2FsbGJhY2soYXN5bmMgKCkgPT4ge1xuICAgIGlmICghcmVzb3VyY2VJZCB8fCAhcmVjb3JkSWQpIHJldHVybjtcblxuICAgIHNldExvYWRpbmcodHJ1ZSk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3AgPSBhd2FpdCBhcGkucmVjb3JkQWN0aW9uKHtcbiAgICAgICAgcmVzb3VyY2VJZCxcbiAgICAgICAgcmVjb3JkSWQsXG4gICAgICAgIGFjdGlvbk5hbWU6IFwiZG93bmxvYWRDdlwiLFxuICAgICAgICBkYXRhOiB7IG9wOiBcImRvd25sb2FkXCIgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBkYXRhID0gKHJlc3A/LmRhdGEgPz8ge30pIGFzIERvd25sb2FkUmVzcDtcbiAgICAgIGlmIChkYXRhLm5vdGljZSkgYWRkTm90aWNlKGRhdGEubm90aWNlKTtcblxuICAgICAgY29uc3QgdXJsID0gdHlwZW9mIGRhdGEucmVkaXJlY3RVcmwgPT09IFwic3RyaW5nXCIgPyBkYXRhLnJlZGlyZWN0VXJsIDogXCJcIjtcbiAgICAgIGlmICghdXJsKSB7XG4gICAgICAgIGFkZE5vdGljZSh7IG1lc3NhZ2U6IFwiTm8gQ1YgYXZhaWxhYmxlXCIsIHR5cGU6IFwiZXJyb3JcIiB9KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBvcGVuZWQgPSB3aW5kb3cub3Blbih1cmwsIFwiX2JsYW5rXCIsIFwibm9vcGVuZXIsbm9yZWZlcnJlclwiKTtcbiAgICAgIGlmICghb3BlbmVkKSB7XG4gICAgICAgIC8vIEZhbGxiYWNrIGlmIHBvcHVwIGJsb2NrZWQuXG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gdXJsO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFwiRmFpbGVkIHRvIGRvd25sb2FkIENWXCI7XG4gICAgICBhZGROb3RpY2UoeyBtZXNzYWdlLCB0eXBlOiBcImVycm9yXCIgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHNldExvYWRpbmcoZmFsc2UpO1xuICAgIH1cbiAgfSwgW2FkZE5vdGljZSwgYXBpLCByZWNvcmRJZCwgcmVzb3VyY2VJZF0pO1xuXG4gIHJldHVybiBjcmVhdGVFbGVtZW50KFxuICAgIEJveCxcbiAgICB7IHZhcmlhbnQ6IFwid2hpdGVcIiwgYm9yZGVyOiBcImRlZmF1bHRcIiwgcDogXCJ4bFwiIH0sXG4gICAgY3JlYXRlRWxlbWVudChUZXh0LCB7IGZvbnRXZWlnaHQ6IFwiYm9sZFwiLCBtYjogXCJkZWZhdWx0XCIgfSwgXCJEb3dubG9hZCBDVlwiKSxcbiAgICBjcmVhdGVFbGVtZW50KFxuICAgICAgVGV4dCxcbiAgICAgIHsgbWI6IFwieGxcIiB9LFxuICAgICAgXCJUaGlzIG9wZW5zIHRoZSBjYW5kaWRhdGUncyBDViBpbiBhIG5ldyB0YWIuXCIsXG4gICAgKSxcbiAgICBjcmVhdGVFbGVtZW50KFxuICAgICAgQnV0dG9uLFxuICAgICAgeyB2YXJpYW50OiBcImNvbnRhaW5lZFwiLCBvbkNsaWNrOiBvcGVuSW5OZXdUYWIsIGRpc2FibGVkOiBsb2FkaW5nIH0sXG4gICAgICBsb2FkaW5nID8gY3JlYXRlRWxlbWVudChMb2FkZXIsIHsgc2l6ZTogMTQgfSkgOiBudWxsLFxuICAgICAgbG9hZGluZyA/IFwiT3BlbmluZ+KAplwiIDogXCJPcGVuIENWIGluIG5ldyB0YWJcIixcbiAgICAgIGxvYWRpbmcgPyBudWxsIDogY3JlYXRlRWxlbWVudChJY29uLCB7IGljb246IFwiRXh0ZXJuYWxMaW5rXCIgfSksXG4gICAgKSxcbiAgKTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IENhcmVlckFwcGxpY2F0aW9uRG93bmxvYWRDdjtcbiIsImltcG9ydCB7IERyb3Bab25lLCBEcm9wWm9uZUl0ZW0sIEZvcm1Hcm91cCwgTGFiZWwgfSBmcm9tICdAYWRtaW5qcy9kZXNpZ24tc3lzdGVtJztcbmltcG9ydCB7IGZsYXQsIHVzZVRyYW5zbGF0aW9uIH0gZnJvbSAnYWRtaW5qcyc7XG5pbXBvcnQgUmVhY3QsIHsgdXNlRWZmZWN0LCB1c2VTdGF0ZSB9IGZyb20gJ3JlYWN0JztcbmNvbnN0IEVkaXQgPSAoeyBwcm9wZXJ0eSwgcmVjb3JkLCBvbkNoYW5nZSB9KSA9PiB7XG4gICAgY29uc3QgeyB0cmFuc2xhdGVQcm9wZXJ0eSB9ID0gdXNlVHJhbnNsYXRpb24oKTtcbiAgICBjb25zdCB7IHBhcmFtcyB9ID0gcmVjb3JkO1xuICAgIGNvbnN0IHsgY3VzdG9tIH0gPSBwcm9wZXJ0eTtcbiAgICBjb25zdCBwYXRoID0gZmxhdC5nZXQocGFyYW1zLCBjdXN0b20uZmlsZVBhdGhQcm9wZXJ0eSk7XG4gICAgY29uc3Qga2V5ID0gZmxhdC5nZXQocGFyYW1zLCBjdXN0b20ua2V5UHJvcGVydHkpO1xuICAgIGNvbnN0IGZpbGUgPSBmbGF0LmdldChwYXJhbXMsIGN1c3RvbS5maWxlUHJvcGVydHkpO1xuICAgIGNvbnN0IFtvcmlnaW5hbEtleSwgc2V0T3JpZ2luYWxLZXldID0gdXNlU3RhdGUoa2V5KTtcbiAgICBjb25zdCBbZmlsZXNUb1VwbG9hZCwgc2V0RmlsZXNUb1VwbG9hZF0gPSB1c2VTdGF0ZShbXSk7XG4gICAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICAgICAgLy8gaXQgbWVhbnMgbWVhbnMgdGhhdCBzb21lb25lIGhpdCBzYXZlIGFuZCBuZXcgZmlsZSBoYXMgYmVlbiB1cGxvYWRlZFxuICAgICAgICAvLyBpbiB0aGlzIGNhc2UgZmxpZXNUb1VwbG9hZCBzaG91bGQgYmUgY2xlYXJlZC5cbiAgICAgICAgLy8gVGhpcyBoYXBwZW5zIHdoZW4gdXNlciB0dXJucyBvZmYgcmVkaXJlY3QgYWZ0ZXIgbmV3L2VkaXRcbiAgICAgICAgaWYgKCh0eXBlb2Yga2V5ID09PSAnc3RyaW5nJyAmJiBrZXkgIT09IG9yaWdpbmFsS2V5KVxuICAgICAgICAgICAgfHwgKHR5cGVvZiBrZXkgIT09ICdzdHJpbmcnICYmICFvcmlnaW5hbEtleSlcbiAgICAgICAgICAgIHx8ICh0eXBlb2Yga2V5ICE9PSAnc3RyaW5nJyAmJiBBcnJheS5pc0FycmF5KGtleSkgJiYga2V5Lmxlbmd0aCAhPT0gb3JpZ2luYWxLZXkubGVuZ3RoKSkge1xuICAgICAgICAgICAgc2V0T3JpZ2luYWxLZXkoa2V5KTtcbiAgICAgICAgICAgIHNldEZpbGVzVG9VcGxvYWQoW10pO1xuICAgICAgICB9XG4gICAgfSwgW2tleSwgb3JpZ2luYWxLZXldKTtcbiAgICBjb25zdCBvblVwbG9hZCA9IChmaWxlcykgPT4ge1xuICAgICAgICBzZXRGaWxlc1RvVXBsb2FkKGZpbGVzKTtcbiAgICAgICAgb25DaGFuZ2UoY3VzdG9tLmZpbGVQcm9wZXJ0eSwgZmlsZXMpO1xuICAgIH07XG4gICAgY29uc3QgaGFuZGxlUmVtb3ZlID0gKCkgPT4ge1xuICAgICAgICBvbkNoYW5nZShjdXN0b20uZmlsZVByb3BlcnR5LCBudWxsKTtcbiAgICB9O1xuICAgIGNvbnN0IGhhbmRsZU11bHRpUmVtb3ZlID0gKHNpbmdsZUtleSkgPT4ge1xuICAgICAgICBjb25zdCBpbmRleCA9IChmbGF0LmdldChyZWNvcmQucGFyYW1zLCBjdXN0b20ua2V5UHJvcGVydHkpIHx8IFtdKS5pbmRleE9mKHNpbmdsZUtleSk7XG4gICAgICAgIGNvbnN0IGZpbGVzVG9EZWxldGUgPSBmbGF0LmdldChyZWNvcmQucGFyYW1zLCBjdXN0b20uZmlsZXNUb0RlbGV0ZVByb3BlcnR5KSB8fCBbXTtcbiAgICAgICAgaWYgKHBhdGggJiYgcGF0aC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBuZXdQYXRoID0gcGF0aC5tYXAoKGN1cnJlbnRQYXRoLCBpKSA9PiAoaSAhPT0gaW5kZXggPyBjdXJyZW50UGF0aCA6IG51bGwpKTtcbiAgICAgICAgICAgIGxldCBuZXdQYXJhbXMgPSBmbGF0LnNldChyZWNvcmQucGFyYW1zLCBjdXN0b20uZmlsZXNUb0RlbGV0ZVByb3BlcnR5LCBbLi4uZmlsZXNUb0RlbGV0ZSwgaW5kZXhdKTtcbiAgICAgICAgICAgIG5ld1BhcmFtcyA9IGZsYXQuc2V0KG5ld1BhcmFtcywgY3VzdG9tLmZpbGVQYXRoUHJvcGVydHksIG5ld1BhdGgpO1xuICAgICAgICAgICAgb25DaGFuZ2Uoe1xuICAgICAgICAgICAgICAgIC4uLnJlY29yZCxcbiAgICAgICAgICAgICAgICBwYXJhbXM6IG5ld1BhcmFtcyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdZb3UgY2Fubm90IHJlbW92ZSBmaWxlIHdoZW4gdGhlcmUgYXJlIG5vIHVwbG9hZGVkIGZpbGVzIHlldCcpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gKFJlYWN0LmNyZWF0ZUVsZW1lbnQoRm9ybUdyb3VwLCBudWxsLFxuICAgICAgICBSZWFjdC5jcmVhdGVFbGVtZW50KExhYmVsLCBudWxsLCB0cmFuc2xhdGVQcm9wZXJ0eShwcm9wZXJ0eS5sYWJlbCwgcHJvcGVydHkucmVzb3VyY2VJZCkpLFxuICAgICAgICBSZWFjdC5jcmVhdGVFbGVtZW50KERyb3Bab25lLCB7IG9uQ2hhbmdlOiBvblVwbG9hZCwgbXVsdGlwbGU6IGN1c3RvbS5tdWx0aXBsZSwgdmFsaWRhdGU6IHtcbiAgICAgICAgICAgICAgICBtaW1lVHlwZXM6IGN1c3RvbS5taW1lVHlwZXMsXG4gICAgICAgICAgICAgICAgbWF4U2l6ZTogY3VzdG9tLm1heFNpemUsXG4gICAgICAgICAgICB9LCBmaWxlczogZmlsZXNUb1VwbG9hZCB9KSxcbiAgICAgICAgIWN1c3RvbS5tdWx0aXBsZSAmJiBrZXkgJiYgcGF0aCAmJiAhZmlsZXNUb1VwbG9hZC5sZW5ndGggJiYgZmlsZSAhPT0gbnVsbCAmJiAoUmVhY3QuY3JlYXRlRWxlbWVudChEcm9wWm9uZUl0ZW0sIHsgZmlsZW5hbWU6IGtleSwgc3JjOiBwYXRoLCBvblJlbW92ZTogaGFuZGxlUmVtb3ZlIH0pKSxcbiAgICAgICAgY3VzdG9tLm11bHRpcGxlICYmIGtleSAmJiBrZXkubGVuZ3RoICYmIHBhdGggPyAoUmVhY3QuY3JlYXRlRWxlbWVudChSZWFjdC5GcmFnbWVudCwgbnVsbCwga2V5Lm1hcCgoc2luZ2xlS2V5LCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgLy8gd2hlbiB3ZSByZW1vdmUgaXRlbXMgd2Ugc2V0IG9ubHkgcGF0aCBpbmRleCB0byBudWxscy5cbiAgICAgICAgICAgIC8vIGtleSBpcyBzdGlsbCB0aGVyZS4gVGhpcyBpcyBiZWNhdXNlXG4gICAgICAgICAgICAvLyB3ZSBoYXZlIHRvIG1haW50YWluIGFsbCB0aGUgaW5kZXhlcy4gU28gaGVyZSB3ZSBzaW1wbHkgZmlsdGVyIG91dCBlbGVtZW50cyB3aGljaFxuICAgICAgICAgICAgLy8gd2VyZSByZW1vdmVkIGFuZCBkaXNwbGF5IG9ubHkgd2hhdCB3YXMgbGVmdFxuICAgICAgICAgICAgY29uc3QgY3VycmVudFBhdGggPSBwYXRoW2luZGV4XTtcbiAgICAgICAgICAgIHJldHVybiBjdXJyZW50UGF0aCA/IChSZWFjdC5jcmVhdGVFbGVtZW50KERyb3Bab25lSXRlbSwgeyBrZXk6IHNpbmdsZUtleSwgZmlsZW5hbWU6IHNpbmdsZUtleSwgc3JjOiBwYXRoW2luZGV4XSwgb25SZW1vdmU6ICgpID0+IGhhbmRsZU11bHRpUmVtb3ZlKHNpbmdsZUtleSkgfSkpIDogJyc7XG4gICAgICAgIH0pKSkgOiAnJykpO1xufTtcbmV4cG9ydCBkZWZhdWx0IEVkaXQ7XG4iLCJleHBvcnQgY29uc3QgQXVkaW9NaW1lVHlwZXMgPSBbXG4gICAgJ2F1ZGlvL2FhYycsXG4gICAgJ2F1ZGlvL21pZGknLFxuICAgICdhdWRpby94LW1pZGknLFxuICAgICdhdWRpby9tcGVnJyxcbiAgICAnYXVkaW8vb2dnJyxcbiAgICAnYXBwbGljYXRpb24vb2dnJyxcbiAgICAnYXVkaW8vb3B1cycsXG4gICAgJ2F1ZGlvL3dhdicsXG4gICAgJ2F1ZGlvL3dlYm0nLFxuICAgICdhdWRpby8zZ3BwMicsXG5dO1xuZXhwb3J0IGNvbnN0IFZpZGVvTWltZVR5cGVzID0gW1xuICAgICd2aWRlby94LW1zdmlkZW8nLFxuICAgICd2aWRlby9tcGVnJyxcbiAgICAndmlkZW8vb2dnJyxcbiAgICAndmlkZW8vbXAydCcsXG4gICAgJ3ZpZGVvL3dlYm0nLFxuICAgICd2aWRlby8zZ3BwJyxcbiAgICAndmlkZW8vM2dwcDInLFxuXTtcbmV4cG9ydCBjb25zdCBJbWFnZU1pbWVUeXBlcyA9IFtcbiAgICAnaW1hZ2UvYm1wJyxcbiAgICAnaW1hZ2UvZ2lmJyxcbiAgICAnaW1hZ2UvanBlZycsXG4gICAgJ2ltYWdlL3BuZycsXG4gICAgJ2ltYWdlL3N2Zyt4bWwnLFxuICAgICdpbWFnZS92bmQubWljcm9zb2Z0Lmljb24nLFxuICAgICdpbWFnZS90aWZmJyxcbiAgICAnaW1hZ2Uvd2VicCcsXG5dO1xuZXhwb3J0IGNvbnN0IENvbXByZXNzZWRNaW1lVHlwZXMgPSBbXG4gICAgJ2FwcGxpY2F0aW9uL3gtYnppcCcsXG4gICAgJ2FwcGxpY2F0aW9uL3gtYnppcDInLFxuICAgICdhcHBsaWNhdGlvbi9nemlwJyxcbiAgICAnYXBwbGljYXRpb24vamF2YS1hcmNoaXZlJyxcbiAgICAnYXBwbGljYXRpb24veC10YXInLFxuICAgICdhcHBsaWNhdGlvbi96aXAnLFxuICAgICdhcHBsaWNhdGlvbi94LTd6LWNvbXByZXNzZWQnLFxuXTtcbmV4cG9ydCBjb25zdCBEb2N1bWVudE1pbWVUeXBlcyA9IFtcbiAgICAnYXBwbGljYXRpb24veC1hYml3b3JkJyxcbiAgICAnYXBwbGljYXRpb24veC1mcmVlYXJjJyxcbiAgICAnYXBwbGljYXRpb24vdm5kLmFtYXpvbi5lYm9vaycsXG4gICAgJ2FwcGxpY2F0aW9uL21zd29yZCcsXG4gICAgJ2FwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC53b3JkcHJvY2Vzc2luZ21sLmRvY3VtZW50JyxcbiAgICAnYXBwbGljYXRpb24vdm5kLm1zLWZvbnRvYmplY3QnLFxuICAgICdhcHBsaWNhdGlvbi92bmQub2FzaXMub3BlbmRvY3VtZW50LnByZXNlbnRhdGlvbicsXG4gICAgJ2FwcGxpY2F0aW9uL3ZuZC5vYXNpcy5vcGVuZG9jdW1lbnQuc3ByZWFkc2hlZXQnLFxuICAgICdhcHBsaWNhdGlvbi92bmQub2FzaXMub3BlbmRvY3VtZW50LnRleHQnLFxuICAgICdhcHBsaWNhdGlvbi92bmQubXMtcG93ZXJwb2ludCcsXG4gICAgJ2FwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5wcmVzZW50YXRpb25tbC5wcmVzZW50YXRpb24nLFxuICAgICdhcHBsaWNhdGlvbi92bmQucmFyJyxcbiAgICAnYXBwbGljYXRpb24vcnRmJyxcbiAgICAnYXBwbGljYXRpb24vdm5kLm1zLWV4Y2VsJyxcbiAgICAnYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnNwcmVhZHNoZWV0bWwuc2hlZXQnLFxuXTtcbmV4cG9ydCBjb25zdCBUZXh0TWltZVR5cGVzID0gW1xuICAgICd0ZXh0L2NzcycsXG4gICAgJ3RleHQvY3N2JyxcbiAgICAndGV4dC9odG1sJyxcbiAgICAndGV4dC9jYWxlbmRhcicsXG4gICAgJ3RleHQvamF2YXNjcmlwdCcsXG4gICAgJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICdhcHBsaWNhdGlvbi9sZCtqc29uJyxcbiAgICAndGV4dC9qYXZhc2NyaXB0JyxcbiAgICAndGV4dC9wbGFpbicsXG4gICAgJ2FwcGxpY2F0aW9uL3hodG1sK3htbCcsXG4gICAgJ2FwcGxpY2F0aW9uL3htbCcsXG4gICAgJ3RleHQveG1sJyxcbl07XG5leHBvcnQgY29uc3QgQmluYXJ5RG9jc01pbWVUeXBlcyA9IFtcbiAgICAnYXBwbGljYXRpb24vZXB1Yit6aXAnLFxuICAgICdhcHBsaWNhdGlvbi9wZGYnLFxuXTtcbmV4cG9ydCBjb25zdCBGb250TWltZVR5cGVzID0gW1xuICAgICdmb250L290ZicsXG4gICAgJ2ZvbnQvdHRmJyxcbiAgICAnZm9udC93b2ZmJyxcbiAgICAnZm9udC93b2ZmMicsXG5dO1xuZXhwb3J0IGNvbnN0IE90aGVyTWltZVR5cGVzID0gW1xuICAgICdhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nLFxuICAgICdhcHBsaWNhdGlvbi94LWNzaCcsXG4gICAgJ2FwcGxpY2F0aW9uL3ZuZC5hcHBsZS5pbnN0YWxsZXIreG1sJyxcbiAgICAnYXBwbGljYXRpb24veC1odHRwZC1waHAnLFxuICAgICdhcHBsaWNhdGlvbi94LXNoJyxcbiAgICAnYXBwbGljYXRpb24veC1zaG9ja3dhdmUtZmxhc2gnLFxuICAgICd2bmQudmlzaW8nLFxuICAgICdhcHBsaWNhdGlvbi92bmQubW96aWxsYS54dWwreG1sJyxcbl07XG5leHBvcnQgY29uc3QgTWltZVR5cGVzID0gW1xuICAgIC4uLkF1ZGlvTWltZVR5cGVzLFxuICAgIC4uLlZpZGVvTWltZVR5cGVzLFxuICAgIC4uLkltYWdlTWltZVR5cGVzLFxuICAgIC4uLkNvbXByZXNzZWRNaW1lVHlwZXMsXG4gICAgLi4uRG9jdW1lbnRNaW1lVHlwZXMsXG4gICAgLi4uVGV4dE1pbWVUeXBlcyxcbiAgICAuLi5CaW5hcnlEb2NzTWltZVR5cGVzLFxuICAgIC4uLk90aGVyTWltZVR5cGVzLFxuICAgIC4uLkZvbnRNaW1lVHlwZXMsXG4gICAgLi4uT3RoZXJNaW1lVHlwZXMsXG5dO1xuIiwiLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGltcG9ydC9uby1leHRyYW5lb3VzLWRlcGVuZGVuY2llc1xuaW1wb3J0IHsgQm94LCBCdXR0b24sIEljb24gfSBmcm9tICdAYWRtaW5qcy9kZXNpZ24tc3lzdGVtJztcbmltcG9ydCB7IGZsYXQgfSBmcm9tICdhZG1pbmpzJztcbmltcG9ydCBSZWFjdCBmcm9tICdyZWFjdCc7XG5pbXBvcnQgeyBBdWRpb01pbWVUeXBlcywgSW1hZ2VNaW1lVHlwZXMgfSBmcm9tICcuLi90eXBlcy9taW1lLXR5cGVzLnR5cGUuanMnO1xuY29uc3QgU2luZ2xlRmlsZSA9IChwcm9wcykgPT4ge1xuICAgIGNvbnN0IHsgbmFtZSwgcGF0aCwgbWltZVR5cGUsIHdpZHRoIH0gPSBwcm9wcztcbiAgICBpZiAocGF0aCAmJiBwYXRoLmxlbmd0aCkge1xuICAgICAgICBpZiAobWltZVR5cGUgJiYgSW1hZ2VNaW1lVHlwZXMuaW5jbHVkZXMobWltZVR5cGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gKFJlYWN0LmNyZWF0ZUVsZW1lbnQoXCJpbWdcIiwgeyBzcmM6IHBhdGgsIHN0eWxlOiB7IG1heEhlaWdodDogd2lkdGgsIG1heFdpZHRoOiB3aWR0aCB9LCBhbHQ6IG5hbWUgfSkpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChtaW1lVHlwZSAmJiBBdWRpb01pbWVUeXBlcy5pbmNsdWRlcyhtaW1lVHlwZSkpIHtcbiAgICAgICAgICAgIHJldHVybiAoUmVhY3QuY3JlYXRlRWxlbWVudChcImF1ZGlvXCIsIHsgY29udHJvbHM6IHRydWUsIHNyYzogcGF0aCB9LFxuICAgICAgICAgICAgICAgIFwiWW91ciBicm93c2VyIGRvZXMgbm90IHN1cHBvcnQgdGhlXCIsXG4gICAgICAgICAgICAgICAgUmVhY3QuY3JlYXRlRWxlbWVudChcImNvZGVcIiwgbnVsbCwgXCJhdWRpb1wiKSxcbiAgICAgICAgICAgICAgICBSZWFjdC5jcmVhdGVFbGVtZW50KFwidHJhY2tcIiwgeyBraW5kOiBcImNhcHRpb25zXCIgfSkpKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gKFJlYWN0LmNyZWF0ZUVsZW1lbnQoQm94LCBudWxsLFxuICAgICAgICBSZWFjdC5jcmVhdGVFbGVtZW50KEJ1dHRvbiwgeyBhczogXCJhXCIsIGhyZWY6IHBhdGgsIG1sOiBcImRlZmF1bHRcIiwgc2l6ZTogXCJzbVwiLCByb3VuZGVkOiB0cnVlLCB0YXJnZXQ6IFwiX2JsYW5rXCIgfSxcbiAgICAgICAgICAgIFJlYWN0LmNyZWF0ZUVsZW1lbnQoSWNvbiwgeyBpY29uOiBcIkRvY3VtZW50RG93bmxvYWRcIiwgY29sb3I6IFwid2hpdGVcIiwgbXI6IFwiZGVmYXVsdFwiIH0pLFxuICAgICAgICAgICAgbmFtZSkpKTtcbn07XG5jb25zdCBGaWxlID0gKHsgd2lkdGgsIHJlY29yZCwgcHJvcGVydHkgfSkgPT4ge1xuICAgIGNvbnN0IHsgY3VzdG9tIH0gPSBwcm9wZXJ0eTtcbiAgICBsZXQgcGF0aCA9IGZsYXQuZ2V0KHJlY29yZD8ucGFyYW1zLCBjdXN0b20uZmlsZVBhdGhQcm9wZXJ0eSk7XG4gICAgaWYgKCFwYXRoKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBjb25zdCBuYW1lID0gZmxhdC5nZXQocmVjb3JkPy5wYXJhbXMsIGN1c3RvbS5maWxlTmFtZVByb3BlcnR5ID8gY3VzdG9tLmZpbGVOYW1lUHJvcGVydHkgOiBjdXN0b20ua2V5UHJvcGVydHkpO1xuICAgIGNvbnN0IG1pbWVUeXBlID0gY3VzdG9tLm1pbWVUeXBlUHJvcGVydHlcbiAgICAgICAgJiYgZmxhdC5nZXQocmVjb3JkPy5wYXJhbXMsIGN1c3RvbS5taW1lVHlwZVByb3BlcnR5KTtcbiAgICBpZiAoIXByb3BlcnR5LmN1c3RvbS5tdWx0aXBsZSkge1xuICAgICAgICBpZiAoY3VzdG9tLm9wdHMgJiYgY3VzdG9tLm9wdHMuYmFzZVVybCkge1xuICAgICAgICAgICAgcGF0aCA9IGAke2N1c3RvbS5vcHRzLmJhc2VVcmx9LyR7bmFtZX1gO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAoUmVhY3QuY3JlYXRlRWxlbWVudChTaW5nbGVGaWxlLCB7IHBhdGg6IHBhdGgsIG5hbWU6IG5hbWUsIHdpZHRoOiB3aWR0aCwgbWltZVR5cGU6IG1pbWVUeXBlIH0pKTtcbiAgICB9XG4gICAgaWYgKGN1c3RvbS5vcHRzICYmIGN1c3RvbS5vcHRzLmJhc2VVcmwpIHtcbiAgICAgICAgY29uc3QgYmFzZVVybCA9IGN1c3RvbS5vcHRzLmJhc2VVcmwgfHwgJyc7XG4gICAgICAgIHBhdGggPSBwYXRoLm1hcCgoc2luZ2xlUGF0aCwgaW5kZXgpID0+IGAke2Jhc2VVcmx9LyR7bmFtZVtpbmRleF19YCk7XG4gICAgfVxuICAgIHJldHVybiAoUmVhY3QuY3JlYXRlRWxlbWVudChSZWFjdC5GcmFnbWVudCwgbnVsbCwgcGF0aC5tYXAoKHNpbmdsZVBhdGgsIGluZGV4KSA9PiAoUmVhY3QuY3JlYXRlRWxlbWVudChTaW5nbGVGaWxlLCB7IGtleTogc2luZ2xlUGF0aCwgcGF0aDogc2luZ2xlUGF0aCwgbmFtZTogbmFtZVtpbmRleF0sIHdpZHRoOiB3aWR0aCwgbWltZVR5cGU6IG1pbWVUeXBlW2luZGV4XSB9KSkpKSk7XG59O1xuZXhwb3J0IGRlZmF1bHQgRmlsZTtcbiIsImltcG9ydCBSZWFjdCBmcm9tICdyZWFjdCc7XG5pbXBvcnQgRmlsZSBmcm9tICcuL2ZpbGUuanMnO1xuY29uc3QgTGlzdCA9IChwcm9wcykgPT4gKFJlYWN0LmNyZWF0ZUVsZW1lbnQoRmlsZSwgeyB3aWR0aDogMTAwLCAuLi5wcm9wcyB9KSk7XG5leHBvcnQgZGVmYXVsdCBMaXN0O1xuIiwiaW1wb3J0IHsgRm9ybUdyb3VwLCBMYWJlbCB9IGZyb20gJ0BhZG1pbmpzL2Rlc2lnbi1zeXN0ZW0nO1xuaW1wb3J0IHsgdXNlVHJhbnNsYXRpb24gfSBmcm9tICdhZG1pbmpzJztcbmltcG9ydCBSZWFjdCBmcm9tICdyZWFjdCc7XG5pbXBvcnQgRmlsZSBmcm9tICcuL2ZpbGUuanMnO1xuY29uc3QgU2hvdyA9IChwcm9wcykgPT4ge1xuICAgIGNvbnN0IHsgcHJvcGVydHkgfSA9IHByb3BzO1xuICAgIGNvbnN0IHsgdHJhbnNsYXRlUHJvcGVydHkgfSA9IHVzZVRyYW5zbGF0aW9uKCk7XG4gICAgcmV0dXJuIChSZWFjdC5jcmVhdGVFbGVtZW50KEZvcm1Hcm91cCwgbnVsbCxcbiAgICAgICAgUmVhY3QuY3JlYXRlRWxlbWVudChMYWJlbCwgbnVsbCwgdHJhbnNsYXRlUHJvcGVydHkocHJvcGVydHkubGFiZWwsIHByb3BlcnR5LnJlc291cmNlSWQpKSxcbiAgICAgICAgUmVhY3QuY3JlYXRlRWxlbWVudChGaWxlLCB7IHdpZHRoOiBcIjEwMCVcIiwgLi4ucHJvcHMgfSkpKTtcbn07XG5leHBvcnQgZGVmYXVsdCBTaG93O1xuIiwiQWRtaW5KUy5Vc2VyQ29tcG9uZW50cyA9IHt9XG5pbXBvcnQgQ2FyZWVyQXBwbGljYXRpb25DaGF0IGZyb20gJy4uL3NyYy9pbnRlcmZhY2VzL2h0dHAvYWRtaW4vY29tcG9uZW50cy9DYXJlZXJBcHBsaWNhdGlvbkNoYXQnXG5BZG1pbkpTLlVzZXJDb21wb25lbnRzLkNhcmVlckFwcGxpY2F0aW9uQ2hhdCA9IENhcmVlckFwcGxpY2F0aW9uQ2hhdFxuaW1wb3J0IENhcmVlckFwcGxpY2F0aW9uRG93bmxvYWRDdiBmcm9tICcuLi9zcmMvaW50ZXJmYWNlcy9odHRwL2FkbWluL2NvbXBvbmVudHMvQ2FyZWVyQXBwbGljYXRpb25Eb3dubG9hZEN2J1xuQWRtaW5KUy5Vc2VyQ29tcG9uZW50cy5DYXJlZXJBcHBsaWNhdGlvbkRvd25sb2FkQ3YgPSBDYXJlZXJBcHBsaWNhdGlvbkRvd25sb2FkQ3ZcbmltcG9ydCBVcGxvYWRFZGl0Q29tcG9uZW50IGZyb20gJy4uLy4uL25vZGVfbW9kdWxlcy9AYWRtaW5qcy91cGxvYWQvYnVpbGQvZmVhdHVyZXMvdXBsb2FkLWZpbGUvY29tcG9uZW50cy9VcGxvYWRFZGl0Q29tcG9uZW50J1xuQWRtaW5KUy5Vc2VyQ29tcG9uZW50cy5VcGxvYWRFZGl0Q29tcG9uZW50ID0gVXBsb2FkRWRpdENvbXBvbmVudFxuaW1wb3J0IFVwbG9hZExpc3RDb21wb25lbnQgZnJvbSAnLi4vLi4vbm9kZV9tb2R1bGVzL0BhZG1pbmpzL3VwbG9hZC9idWlsZC9mZWF0dXJlcy91cGxvYWQtZmlsZS9jb21wb25lbnRzL1VwbG9hZExpc3RDb21wb25lbnQnXG5BZG1pbkpTLlVzZXJDb21wb25lbnRzLlVwbG9hZExpc3RDb21wb25lbnQgPSBVcGxvYWRMaXN0Q29tcG9uZW50XG5pbXBvcnQgVXBsb2FkU2hvd0NvbXBvbmVudCBmcm9tICcuLi8uLi9ub2RlX21vZHVsZXMvQGFkbWluanMvdXBsb2FkL2J1aWxkL2ZlYXR1cmVzL3VwbG9hZC1maWxlL2NvbXBvbmVudHMvVXBsb2FkU2hvd0NvbXBvbmVudCdcbkFkbWluSlMuVXNlckNvbXBvbmVudHMuVXBsb2FkU2hvd0NvbXBvbmVudCA9IFVwbG9hZFNob3dDb21wb25lbnQiXSwibmFtZXMiOlsic2FmZURlY29kZVVSSUNvbXBvbmVudCIsInZhbHVlIiwiZGVjb2RlVVJJQ29tcG9uZW50IiwiZ2V0UmVzb3VyY2VJZEZyb21QYXRobmFtZSIsInBhdGhuYW1lIiwibSIsIm1hdGNoIiwiZ2V0UmVjb3JkSWRGcm9tUGF0aG5hbWUiLCJmb3JtYXRUaW1lc3RhbXAiLCJpc28iLCJkIiwiRGF0ZSIsIk51bWJlciIsImlzTmFOIiwiZ2V0VGltZSIsInRvTG9jYWxlU3RyaW5nIiwibWVyZ2VNZXNzYWdlcyIsImV4aXN0aW5nIiwiaW5jb21pbmciLCJieUlkIiwiTWFwIiwic2V0IiwiaWQiLCJvdXQiLCJBcnJheSIsImZyb20iLCJ2YWx1ZXMiLCJzb3J0IiwiYSIsImIiLCJjcmVhdGVkQXQiLCJ3aXRoVGltZW91dCIsInByb21pc2UiLCJtcyIsImxhYmVsIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJ0Iiwic2V0VGltZW91dCIsIkVycm9yIiwidGhlbiIsImNsZWFyVGltZW91dCIsImVyciIsIkJveCIsIkJ1dHRvbiIsIkRyYXdlckNvbnRlbnQiLCJJY29uIiwiTG9hZGVyIiwiVGV4dCIsIlRleHRBcmVhIiwiQWRtaW5KU0Rlc2lnblN5c3RlbSIsImNyZWF0ZUVsZW1lbnQiLCJ1c2VDYWxsYmFjayIsInVzZUVmZmVjdCIsInVzZU1lbW8iLCJ1c2VSZWYiLCJ1c2VTdGF0ZSIsIlJlYWN0IiwiQ2FyZWVyQXBwbGljYXRpb25DaGF0IiwicHJvcHMiLCJyZXNvdXJjZSIsInJlY29yZCIsImFkZE5vdGljZSIsIkFkbWluSlMiLCJ1c2VOb3RpY2UiLCJhcGkiLCJBcGlDbGllbnQiLCJTdHJpbmciLCJ3aW5kb3ciLCJsb2NhdGlvbiIsInJlc291cmNlSWRGcm9tUGF0aCIsInJlY29yZElkRnJvbVBhdGgiLCJyZXNvdXJjZUlkIiwidHJpbSIsInVuZGVmaW5lZCIsInJlY29yZElkIiwicGFyYW1zIiwibG9hZGluZyIsInNldExvYWRpbmciLCJtZXNzYWdlcyIsInNldE1lc3NhZ2VzIiwiZHJhZnQiLCJzZXREcmFmdCIsInNlbmRpbmciLCJzZXRTZW5kaW5nIiwibWVzc2FnZXNFbmRSZWYiLCJjYW5Eb3dubG9hZEN2IiwiYWN0aW9ucyIsImlzQXJyYXkiLCJyZWNvcmRBY3Rpb25zIiwic29tZSIsIm5hbWUiLCJzY3JvbGxUb0JvdHRvbSIsImN1cnJlbnQiLCJzY3JvbGxJbnRvVmlldyIsImJlaGF2aW9yIiwiYmxvY2siLCJsb2FkSW5pdGlhbCIsInJlc3AiLCJyZWNvcmRBY3Rpb24iLCJhY3Rpb25OYW1lIiwiZGF0YSIsIm9wIiwibm90aWNlIiwibXNncyIsImUiLCJtZXNzYWdlIiwidHlwZSIsImhhbmRsZVJlZnJlc2giLCJoYW5kbGVEb3dubG9hZEN2IiwidXJsIiwicmVkaXJlY3RVcmwiLCJvcGVuZWQiLCJvcGVuIiwiaHJlZiIsImhhbmRsZVNlbmQiLCJjcmVhdGVkIiwicHJldiIsIm1zZyIsImhlYWRlciIsImZsZXgiLCJqdXN0aWZ5Q29udGVudCIsIm1iIiwiYWxpZ25JdGVtcyIsImZvbnRXZWlnaHQiLCJzdHlsZSIsImRpc3BsYXkiLCJnYXAiLCJ2YXJpYW50Iiwib25DbGljayIsImRpc2FibGVkIiwiYm9keSIsInB5IiwidGV4dEFsaWduIiwiYm9yZGVyIiwicCIsIm1heEhlaWdodCIsIm92ZXJmbG93WSIsImxlbmd0aCIsIm1hcCIsImtleSIsImJvcmRlclJhZGl1cyIsImZvbnRTaXplIiwic2VuZGVyUm9sZSIsInJlZiIsImNvbXBvc2VyIiwibXQiLCJvbkNoYW5nZSIsInRhcmdldCIsInBsYWNlaG9sZGVyIiwiaWNvbiIsInNwaW4iLCJDYXJlZXJBcHBsaWNhdGlvbkRvd25sb2FkQ3YiLCJvcGVuSW5OZXdUYWIiLCJzaXplIiwiRWRpdCIsInByb3BlcnR5IiwidHJhbnNsYXRlUHJvcGVydHkiLCJ1c2VUcmFuc2xhdGlvbiIsImN1c3RvbSIsInBhdGgiLCJmbGF0IiwiZ2V0IiwiZmlsZVBhdGhQcm9wZXJ0eSIsImtleVByb3BlcnR5IiwiZmlsZSIsImZpbGVQcm9wZXJ0eSIsIm9yaWdpbmFsS2V5Iiwic2V0T3JpZ2luYWxLZXkiLCJmaWxlc1RvVXBsb2FkIiwic2V0RmlsZXNUb1VwbG9hZCIsIm9uVXBsb2FkIiwiZmlsZXMiLCJoYW5kbGVSZW1vdmUiLCJoYW5kbGVNdWx0aVJlbW92ZSIsInNpbmdsZUtleSIsImluZGV4IiwiaW5kZXhPZiIsImZpbGVzVG9EZWxldGUiLCJmaWxlc1RvRGVsZXRlUHJvcGVydHkiLCJuZXdQYXRoIiwiY3VycmVudFBhdGgiLCJpIiwibmV3UGFyYW1zIiwiY29uc29sZSIsImxvZyIsIkZvcm1Hcm91cCIsIkxhYmVsIiwiRHJvcFpvbmUiLCJtdWx0aXBsZSIsInZhbGlkYXRlIiwibWltZVR5cGVzIiwibWF4U2l6ZSIsIkRyb3Bab25lSXRlbSIsImZpbGVuYW1lIiwic3JjIiwib25SZW1vdmUiLCJGcmFnbWVudCIsIkF1ZGlvTWltZVR5cGVzIiwiSW1hZ2VNaW1lVHlwZXMiLCJTaW5nbGVGaWxlIiwibWltZVR5cGUiLCJ3aWR0aCIsImluY2x1ZGVzIiwibWF4V2lkdGgiLCJhbHQiLCJjb250cm9scyIsImtpbmQiLCJhcyIsIm1sIiwicm91bmRlZCIsImNvbG9yIiwibXIiLCJGaWxlIiwiZmlsZU5hbWVQcm9wZXJ0eSIsIm1pbWVUeXBlUHJvcGVydHkiLCJvcHRzIiwiYmFzZVVybCIsInNpbmdsZVBhdGgiLCJMaXN0IiwiU2hvdyIsIlVzZXJDb21wb25lbnRzIiwiVXBsb2FkRWRpdENvbXBvbmVudCIsIlVwbG9hZExpc3RDb21wb25lbnQiLCJVcGxvYWRTaG93Q29tcG9uZW50Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0VBYUEsU0FBU0Esc0JBQXNCQSxDQUFDQyxLQUFhLEVBQVU7SUFDckQsSUFBSTtNQUNGLE9BQU9DLGtCQUFrQixDQUFDRCxLQUFLLENBQUM7RUFDbEMsRUFBQSxDQUFDLENBQUMsTUFBTTtFQUNOLElBQUEsT0FBT0EsS0FBSztFQUNkLEVBQUE7RUFDRjtFQUVBLFNBQVNFLHlCQUF5QkEsQ0FBQ0MsUUFBZ0IsRUFBVTtFQUMzRCxFQUFBLE1BQU1DLENBQUMsR0FBR0QsUUFBUSxDQUFDRSxLQUFLLENBQUMsc0JBQXNCLENBQUM7RUFDaEQsRUFBQSxPQUFPRCxDQUFDLElBQUksT0FBT0EsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLFFBQVEsR0FBR0wsc0JBQXNCLENBQUNLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUU7RUFDMUU7RUFFQSxTQUFTRSx1QkFBdUJBLENBQUNILFFBQWdCLEVBQVU7RUFDekQsRUFBQSxNQUFNQyxDQUFDLEdBQUdELFFBQVEsQ0FBQ0UsS0FBSyxDQUFDLG9CQUFvQixDQUFDO0VBQzlDLEVBQUEsT0FBT0QsQ0FBQyxJQUFJLE9BQU9BLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxRQUFRLEdBQUdMLHNCQUFzQixDQUFDSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFO0VBQzFFO0VBRUEsU0FBU0csZUFBZUEsQ0FBQ0MsR0FBVyxFQUFVO0lBQzVDLElBQUk7RUFDRixJQUFBLE1BQU1DLENBQUMsR0FBRyxJQUFJQyxJQUFJLENBQUNGLEdBQUcsQ0FBQztFQUN2QixJQUFBLElBQUlHLE1BQU0sQ0FBQ0MsS0FBSyxDQUFDSCxDQUFDLENBQUNJLE9BQU8sRUFBRSxDQUFDLEVBQUUsT0FBT0wsR0FBRztFQUN6QyxJQUFBLE9BQU9DLENBQUMsQ0FBQ0ssY0FBYyxFQUFFO0VBQzNCLEVBQUEsQ0FBQyxDQUFDLE1BQU07RUFDTixJQUFBLE9BQU9OLEdBQUc7RUFDWixFQUFBO0VBQ0Y7RUFFQSxTQUFTTyxhQUFhQSxDQUNwQkMsUUFBdUIsRUFDdkJDLFFBQXVCLEVBQ1I7RUFDZixFQUFBLE1BQU1DLElBQUksR0FBRyxJQUFJQyxHQUFHLEVBQXVCO0VBQzNDLEVBQUEsS0FBSyxNQUFNZixDQUFDLElBQUlZLFFBQVEsRUFBRUUsSUFBSSxDQUFDRSxHQUFHLENBQUNoQixDQUFDLENBQUNpQixFQUFFLEVBQUVqQixDQUFDLENBQUM7RUFDM0MsRUFBQSxLQUFLLE1BQU1BLENBQUMsSUFBSWEsUUFBUSxFQUFFO0VBQ3hCLElBQUEsSUFBSWIsQ0FBQyxJQUFJLE9BQU9BLENBQUMsQ0FBQ2lCLEVBQUUsS0FBSyxRQUFRLEVBQUVILElBQUksQ0FBQ0UsR0FBRyxDQUFDaEIsQ0FBQyxDQUFDaUIsRUFBRSxFQUFFakIsQ0FBQyxDQUFDO0VBQ3RELEVBQUE7SUFDQSxNQUFNa0IsR0FBRyxHQUFHQyxLQUFLLENBQUNDLElBQUksQ0FBQ04sSUFBSSxDQUFDTyxNQUFNLEVBQUUsQ0FBQztFQUNyQ0gsRUFBQUEsR0FBRyxDQUFDSSxJQUFJLENBQ04sQ0FBQ0MsQ0FBQyxFQUFFQyxDQUFDLEtBQUssSUFBSWxCLElBQUksQ0FBQ2lCLENBQUMsQ0FBQ0UsU0FBUyxDQUFDLENBQUNoQixPQUFPLEVBQUUsR0FBRyxJQUFJSCxJQUFJLENBQUNrQixDQUFDLENBQUNDLFNBQVMsQ0FBQyxDQUFDaEIsT0FBTyxFQUMzRSxDQUFDO0VBQ0QsRUFBQSxPQUFPUyxHQUFHO0VBQ1o7RUFFQSxTQUFTUSxXQUFXQSxDQUNsQkMsT0FBbUIsRUFDbkJDLEVBQVUsRUFDVkMsS0FBYSxFQUNEO0VBQ1osRUFBQSxPQUFPLElBQUlDLE9BQU8sQ0FBSSxDQUFDQyxPQUFPLEVBQUVDLE1BQU0sS0FBSztFQUN6QyxJQUFBLE1BQU1DLENBQUMsR0FBR0MsVUFBVSxDQUFDLE1BQU07UUFDekJGLE1BQU0sQ0FBQyxJQUFJRyxLQUFLLENBQUMsR0FBR04sS0FBSyxDQUFBLFVBQUEsQ0FBWSxDQUFDLENBQUM7TUFDekMsQ0FBQyxFQUFFRCxFQUFFLENBQUM7RUFFTkQsSUFBQUEsT0FBTyxDQUFDUyxJQUFJLENBQ1R4QyxLQUFLLElBQUs7UUFDVHlDLFlBQVksQ0FBQ0osQ0FBQyxDQUFDO1FBQ2ZGLE9BQU8sQ0FBQ25DLEtBQUssQ0FBQztNQUNoQixDQUFDLEVBQ0EwQyxHQUFHLElBQUs7UUFDUEQsWUFBWSxDQUFDSixDQUFDLENBQUM7UUFDZkQsTUFBTSxDQUFDTSxHQUFHLENBQUM7RUFDYixJQUFBLENBQ0YsQ0FBQztFQUNILEVBQUEsQ0FBQyxDQUFDO0VBQ0o7RUFFQSxNQUFNO1NBQUVDLEtBQUc7WUFBRUMsUUFBTTtJQUFFQyxhQUFhO1VBQUVDLE1BQUk7WUFBRUMsUUFBTTtVQUFFQyxNQUFJO0VBQUVDLEVBQUFBO0VBQVMsQ0FBQyxHQUNoRUMsbUJBQW1CO0VBRXJCLE1BQU07bUJBQUVDLGVBQWE7aUJBQUVDLGFBQVc7SUFBRUMsU0FBUzthQUFFQyxTQUFPO0lBQUVDLE1BQU07RUFBRUMsWUFBQUE7RUFBUyxDQUFDLEdBQ3hFQyxLQUFLO0VBRVAsTUFBTUMscUJBQXFCLEdBQUlDLEtBQVUsSUFBSztJQUM1QyxNQUFNO01BQUVDLFFBQVE7RUFBRUMsSUFBQUE7RUFBTyxHQUFDLEdBQUdGLEtBQUs7RUFDbEMsRUFBQSxNQUFNRyxTQUFTLEdBQUdDLE9BQU8sQ0FBQ0MsU0FBUyxFQUFFO0VBQ3JDLEVBQUEsTUFBTUMsR0FBRyxHQUFHWCxTQUFPLENBQUMsTUFBTSxJQUFJUyxPQUFPLENBQUNHLFNBQVMsRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUV0RCxNQUFNL0QsUUFBUSxHQUFHZ0UsTUFBTSxDQUFDQyxNQUFNLEVBQUVDLFFBQVEsRUFBRWxFLFFBQVEsSUFBSSxFQUFFLENBQUM7RUFDekQsRUFBQSxNQUFNbUUsa0JBQWtCLEdBQUdwRSx5QkFBeUIsQ0FBQ0MsUUFBUSxDQUFDO0VBQzlELEVBQUEsTUFBTW9FLGdCQUFnQixHQUFHakUsdUJBQXVCLENBQUNILFFBQVEsQ0FBQztFQUUxRCxFQUFBLE1BQU1xRSxVQUFVLEdBQ2IsT0FBT1osUUFBUSxFQUFFdkMsRUFBRSxLQUFLLFFBQVEsSUFBSXVDLFFBQVEsQ0FBQ3ZDLEVBQUUsQ0FBQ29ELElBQUksRUFBRSxJQUN0RCxPQUFPZCxLQUFLLEVBQUVhLFVBQVUsS0FBSyxRQUFRLElBQUliLEtBQUssQ0FBQ2EsVUFBVSxDQUFDQyxJQUFJLEVBQUcsSUFDbEVILGtCQUFrQixJQUNsQkksU0FBUztFQUVYLEVBQUEsTUFBTUMsUUFBUSxHQUNYLE9BQU9kLE1BQU0sRUFBRXhDLEVBQUUsS0FBSyxRQUFRLElBQUl3QyxNQUFNLENBQUN4QyxFQUFFLENBQUNvRCxJQUFJLEVBQUUsSUFDbEQsT0FBT1osTUFBTSxFQUFFZSxNQUFNLEVBQUV2RCxFQUFFLEtBQUssUUFBUSxJQUFJd0MsTUFBTSxDQUFDZSxNQUFNLENBQUN2RCxFQUFFLENBQUNvRCxJQUFJLEVBQUcsSUFDbEUsT0FBT2QsS0FBSyxFQUFFZ0IsUUFBUSxLQUFLLFFBQVEsSUFBSWhCLEtBQUssQ0FBQ2dCLFFBQVEsQ0FBQ0YsSUFBSSxFQUFHLElBQzdELE9BQU9kLEtBQUssRUFBRXRELEtBQUssRUFBRXVFLE1BQU0sRUFBRUQsUUFBUSxLQUFLLFFBQVEsSUFDakRoQixLQUFLLENBQUN0RCxLQUFLLENBQUN1RSxNQUFNLENBQUNELFFBQVEsQ0FBQ0YsSUFBSSxFQUFHLElBQ3JDRixnQkFBZ0IsSUFDaEJHLFNBQVM7SUFFWCxNQUFNLENBQUNHLE9BQU8sRUFBRUMsVUFBVSxDQUFDLEdBQUd0QixVQUFRLENBQUMsSUFBSSxDQUFDO0lBQzVDLE1BQU0sQ0FBQ3VCLFFBQVEsRUFBRUMsV0FBVyxDQUFDLEdBQUd4QixVQUFRLENBQUMsRUFBbUIsQ0FBQztJQUM3RCxNQUFNLENBQUN5QixLQUFLLEVBQUVDLFFBQVEsQ0FBQyxHQUFHMUIsVUFBUSxDQUFDLEVBQUUsQ0FBQztJQUN0QyxNQUFNLENBQUMyQixPQUFPLEVBQUVDLFVBQVUsQ0FBQyxHQUFHNUIsVUFBUSxDQUFDLEtBQUssQ0FBQztFQUU3QyxFQUFBLE1BQU02QixjQUFjLEdBQUc5QixNQUFNLENBQUMsSUFBVyxDQUFDO0VBRTFDLEVBQUEsTUFBTStCLGFBQWEsR0FBR2hDLFNBQU8sQ0FBQyxNQUFNO0VBQ2xDLElBQUEsTUFBTWlDLE9BQW1CLEdBQUdoRSxLQUFLLENBQUNpRSxPQUFPLENBQUMzQixNQUFNLEVBQUU0QixhQUFhLENBQUMsR0FDNUQ1QixNQUFNLENBQUM0QixhQUFhLEdBQ3BCLEVBQUU7TUFDTixPQUFPRixPQUFPLENBQUNHLElBQUksQ0FBRS9ELENBQUMsSUFBS0EsQ0FBQyxFQUFFZ0UsSUFBSSxLQUFLLFlBQVksQ0FBQztFQUN0RCxFQUFBLENBQUMsRUFBRSxDQUFDOUIsTUFBTSxDQUFDLENBQUM7RUFFWixFQUFBLE1BQU0rQixjQUFjLEdBQUd4QyxhQUFXLENBQUMsTUFBTTtNQUN2QyxJQUFJO0VBQ0ZpQyxNQUFBQSxjQUFjLENBQUNRLE9BQU8sRUFBRUMsY0FBYyxHQUFHO0VBQ3ZDQyxRQUFBQSxRQUFRLEVBQUUsUUFBUTtFQUNsQkMsUUFBQUEsS0FBSyxFQUFFO0VBQ1QsT0FBQyxDQUFDO0VBQ0osSUFBQSxDQUFDLENBQUMsTUFBTTtFQUNOO0VBQUEsSUFBQTtJQUVKLENBQUMsRUFBRSxFQUFFLENBQUM7RUFFTixFQUFBLE1BQU1DLFdBQVcsR0FBRzdDLGFBQVcsQ0FBQyxZQUFZO0VBQzFDLElBQUEsSUFBSSxDQUFDb0IsVUFBVSxJQUFJLENBQUNHLFFBQVEsRUFBRTtFQUM1QjtRQUNBRyxVQUFVLENBQUMsS0FBSyxDQUFDO0VBQ2pCLE1BQUE7RUFDRixJQUFBO01BRUFBLFVBQVUsQ0FBQyxJQUFJLENBQUM7TUFDaEIsSUFBSTtRQUNGLE1BQU1vQixJQUFTLEdBQUcsTUFBTXBFLFdBQVcsQ0FDakNtQyxHQUFHLENBQUNrQyxZQUFZLENBQUM7VUFDZjNCLFVBQVU7VUFDVkcsUUFBUTtFQUNSeUIsUUFBQUEsVUFBVSxFQUFFLFVBQVU7RUFDdEJDLFFBQUFBLElBQUksRUFBRTtFQUFFQyxVQUFBQSxFQUFFLEVBQUU7RUFBTztFQUNyQixPQUFDLENBQUMsRUFDRixNQUFNLEVBQ04sY0FDRixDQUFDO0VBQ0QsTUFBQSxJQUFJSixJQUFJLEVBQUVHLElBQUksRUFBRUUsTUFBTSxFQUFFO0VBQ3RCekMsUUFBQUEsU0FBUyxDQUFDb0MsSUFBSSxDQUFDRyxJQUFJLENBQUNFLE1BQU0sQ0FBQztFQUM3QixNQUFBO0VBQ0EsTUFBQSxNQUFNQyxJQUFJLEdBQUdqRixLQUFLLENBQUNpRSxPQUFPLENBQUNVLElBQUksRUFBRUcsSUFBSSxFQUFFdEIsUUFBUSxDQUFDLEdBQzNDbUIsSUFBSSxDQUFDRyxJQUFJLENBQUN0QixRQUFRLEdBQ25CLEVBQUU7UUFDTkMsV0FBVyxDQUFDd0IsSUFBSSxDQUFDO0VBQ2pCbEUsTUFBQUEsVUFBVSxDQUFDc0QsY0FBYyxFQUFFLEVBQUUsQ0FBQztNQUNoQyxDQUFDLENBQUMsT0FBT2EsQ0FBTSxFQUFFO1FBQ2YsTUFBTUMsT0FBTyxHQUFHRCxDQUFDLFlBQVlsRSxLQUFLLEdBQUdrRSxDQUFDLENBQUNDLE9BQU8sR0FBRyxxQkFBcUI7RUFDdEU1QyxNQUFBQSxTQUFTLENBQUM7VUFBRTRDLE9BQU87RUFBRUMsUUFBQUEsSUFBSSxFQUFFO0VBQVEsT0FBQyxDQUFDO0VBQ3ZDLElBQUEsQ0FBQyxTQUFTO1FBQ1I3QixVQUFVLENBQUMsS0FBSyxDQUFDO0VBQ25CLElBQUE7RUFDRixFQUFBLENBQUMsRUFBRSxDQUFDaEIsU0FBUyxFQUFFRyxHQUFHLEVBQUVVLFFBQVEsRUFBRUgsVUFBVSxFQUFFb0IsY0FBYyxDQUFDLENBQUM7RUFFMUR2QyxFQUFBQSxTQUFTLENBQUMsTUFBTTtNQUNkLEtBQUs0QyxXQUFXLEVBQUU7RUFDcEIsRUFBQSxDQUFDLEVBQUUsQ0FBQ0EsV0FBVyxDQUFDLENBQUM7RUFFakIsRUFBQSxNQUFNVyxhQUFhLEdBQUd4RCxhQUFXLENBQUMsTUFBTTtNQUN0QyxLQUFLNkMsV0FBVyxFQUFFO0VBQ3BCLEVBQUEsQ0FBQyxFQUFFLENBQUNBLFdBQVcsQ0FBQyxDQUFDO0VBRWpCLEVBQUEsTUFBTVksZ0JBQWdCLEdBQUd6RCxhQUFXLENBQUMsWUFBWTtFQUMvQyxJQUFBLElBQUksQ0FBQ29CLFVBQVUsSUFBSSxDQUFDRyxRQUFRLEVBQUU7TUFFOUIsSUFBSTtFQUNGLE1BQUEsTUFBTXVCLElBQUksR0FBRyxNQUFNakMsR0FBRyxDQUFDa0MsWUFBWSxDQUFDO1VBQ2xDM0IsVUFBVTtVQUNWRyxRQUFRO0VBQ1J5QixRQUFBQSxVQUFVLEVBQUUsWUFBWTtFQUN4QkMsUUFBQUEsSUFBSSxFQUFFO0VBQUVDLFVBQUFBLEVBQUUsRUFBRTtFQUFXO0VBQ3pCLE9BQUMsQ0FBQztFQUNGLE1BQUEsSUFBSUosSUFBSSxFQUFFRyxJQUFJLEVBQUVFLE1BQU0sRUFBRTtFQUN0QnpDLFFBQUFBLFNBQVMsQ0FBQ29DLElBQUksQ0FBQ0csSUFBSSxDQUFDRSxNQUFNLENBQUM7RUFDN0IsTUFBQTtFQUNBLE1BQUEsTUFBTU8sR0FBRyxHQUFHWixJQUFJLEVBQUVHLElBQUksRUFBRVUsV0FBVztFQUNuQyxNQUFBLElBQUksT0FBT0QsR0FBRyxLQUFLLFFBQVEsSUFBSUEsR0FBRyxFQUFFO1VBQ2xDLE1BQU1FLE1BQU0sR0FBRzVDLE1BQU0sQ0FBQzZDLElBQUksQ0FBQ0gsR0FBRyxFQUFFLFFBQVEsRUFBRSxxQkFBcUIsQ0FBQztVQUNoRSxJQUFJLENBQUNFLE1BQU0sRUFBRTVDLE1BQU0sQ0FBQ0MsUUFBUSxDQUFDNkMsSUFBSSxHQUFHSixHQUFHO0VBQ3ZDLFFBQUE7RUFDRixNQUFBO0VBQ0FoRCxNQUFBQSxTQUFTLENBQUM7RUFBRTRDLFFBQUFBLE9BQU8sRUFBRSxpQkFBaUI7RUFBRUMsUUFBQUEsSUFBSSxFQUFFO0VBQVEsT0FBQyxDQUFDO01BQzFELENBQUMsQ0FBQyxPQUFPRixDQUFNLEVBQUU7UUFDZixNQUFNQyxPQUFPLEdBQUdELENBQUMsWUFBWWxFLEtBQUssR0FBR2tFLENBQUMsQ0FBQ0MsT0FBTyxHQUFHLHVCQUF1QjtFQUN4RTVDLE1BQUFBLFNBQVMsQ0FBQztVQUFFNEMsT0FBTztFQUFFQyxRQUFBQSxJQUFJLEVBQUU7RUFBUSxPQUFDLENBQUM7RUFDdkMsSUFBQTtJQUNGLENBQUMsRUFBRSxDQUFDN0MsU0FBUyxFQUFFRyxHQUFHLEVBQUVVLFFBQVEsRUFBRUgsVUFBVSxDQUFDLENBQUM7RUFFMUMsRUFBQSxNQUFNMkMsVUFBVSxHQUFHL0QsYUFBVyxDQUFDLFlBQVk7RUFDekMsSUFBQSxJQUFJLENBQUNvQixVQUFVLElBQUksQ0FBQ0csUUFBUSxFQUFFO0VBRTlCLElBQUEsTUFBTStCLE9BQU8sR0FBR3pCLEtBQUssQ0FBQ1IsSUFBSSxFQUFFO01BQzVCLElBQUksQ0FBQ2lDLE9BQU8sRUFBRTtNQUVkdEIsVUFBVSxDQUFDLElBQUksQ0FBQztNQUNoQixJQUFJO0VBQ0YsTUFBQSxNQUFNYyxJQUFJLEdBQUcsTUFBTWpDLEdBQUcsQ0FBQ2tDLFlBQVksQ0FBQztVQUNsQzNCLFVBQVU7VUFDVkcsUUFBUTtFQUNSeUIsUUFBQUEsVUFBVSxFQUFFLFVBQVU7RUFDdEJDLFFBQUFBLElBQUksRUFBRTtFQUFFSyxVQUFBQTtFQUFRO0VBQ2xCLE9BQUMsQ0FBQztFQUNGLE1BQUEsSUFBSVIsSUFBSSxFQUFFRyxJQUFJLEVBQUVFLE1BQU0sRUFBRTtFQUN0QnpDLFFBQUFBLFNBQVMsQ0FBQ29DLElBQUksQ0FBQ0csSUFBSSxDQUFDRSxNQUFNLENBQUM7RUFDN0IsTUFBQTtFQUNBLE1BQUEsTUFBTWEsT0FBTyxHQUFHbEIsSUFBSSxFQUFFRyxJQUFJLEVBQUVLLE9BQWtDO1FBQzlELElBQUlVLE9BQU8sSUFBSSxPQUFPQSxPQUFPLENBQUMvRixFQUFFLEtBQUssUUFBUSxFQUFFO1VBQzdDMkQsV0FBVyxDQUFFcUMsSUFBbUIsSUFBS3RHLGFBQWEsQ0FBQ3NHLElBQUksRUFBRSxDQUFDRCxPQUFPLENBQUMsQ0FBQyxDQUFDO1VBQ3BFbEMsUUFBUSxDQUFDLEVBQUUsQ0FBQztFQUNaNUMsUUFBQUEsVUFBVSxDQUFDc0QsY0FBYyxFQUFFLENBQUMsQ0FBQztFQUMvQixNQUFBO01BQ0YsQ0FBQyxDQUFDLE9BQU9hLENBQU0sRUFBRTtRQUNmLE1BQU1hLEdBQUcsR0FBR2IsQ0FBQyxZQUFZbEUsS0FBSyxHQUFHa0UsQ0FBQyxDQUFDQyxPQUFPLEdBQUcsd0JBQXdCO0VBQ3JFNUMsTUFBQUEsU0FBUyxDQUFDO0VBQUU0QyxRQUFBQSxPQUFPLEVBQUVZLEdBQUc7RUFBRVgsUUFBQUEsSUFBSSxFQUFFO0VBQVEsT0FBQyxDQUFDO0VBQzVDLElBQUEsQ0FBQyxTQUFTO1FBQ1J2QixVQUFVLENBQUMsS0FBSyxDQUFDO0VBQ25CLElBQUE7RUFDRixFQUFBLENBQUMsRUFBRSxDQUFDdEIsU0FBUyxFQUFFRyxHQUFHLEVBQUVnQixLQUFLLEVBQUVOLFFBQVEsRUFBRUgsVUFBVSxFQUFFb0IsY0FBYyxDQUFDLENBQUM7RUFFakUsRUFBQSxNQUFNMkIsTUFBTSxHQUFHcEUsZUFBYSxDQUMxQlIsS0FBRyxFQUNIO0VBQ0U2RSxJQUFBQSxJQUFJLEVBQUUsSUFBSTtFQUNWQyxJQUFBQSxjQUFjLEVBQUUsZUFBZTtFQUMvQkMsSUFBQUEsRUFBRSxFQUFFLElBQUk7RUFDUkMsSUFBQUEsVUFBVSxFQUFFO0VBQ2QsR0FBQyxFQUNEeEUsZUFBYSxDQUFDSCxNQUFJLEVBQUU7RUFBRTRFLElBQUFBLFVBQVUsRUFBRTtFQUFPLEdBQUMsRUFBRSxNQUFNLENBQUMsRUFDbkR6RSxlQUFhLENBQ1hSLEtBQUcsRUFDSDtFQUFFa0YsSUFBQUEsS0FBSyxFQUFFO0VBQUVDLE1BQUFBLE9BQU8sRUFBRSxNQUFNO0VBQUVDLE1BQUFBLEdBQUcsRUFBRTtFQUFFO0VBQUUsR0FBQyxFQUN0QzVFLGVBQWEsQ0FDWFAsUUFBTSxFQUNOO0VBQUVvRixJQUFBQSxPQUFPLEVBQUUsVUFBVTtFQUFFQyxJQUFBQSxPQUFPLEVBQUVyQixhQUFhO0VBQUVzQixJQUFBQSxRQUFRLEVBQUVyRDtLQUFTLEVBQ2xFLFNBQ0YsQ0FBQyxFQUNEUyxhQUFhLEdBQ1RuQyxlQUFhLENBQ1hQLFFBQU0sRUFDTjtFQUFFb0YsSUFBQUEsT0FBTyxFQUFFLFVBQVU7RUFBRUMsSUFBQUEsT0FBTyxFQUFFcEI7RUFBaUIsR0FBQyxFQUNsRCxhQUNGLENBQUMsR0FDRCxJQUNOLENBQ0YsQ0FBQztFQUVELEVBQUEsTUFBTXNCLElBQUksR0FBR3RELE9BQU8sR0FDaEIxQixlQUFhLENBQ1hSLEtBQUcsRUFDSDtFQUFFeUYsSUFBQUEsRUFBRSxFQUFFLEtBQUs7RUFBRUMsSUFBQUEsU0FBUyxFQUFFO0VBQVMsR0FBQyxFQUNsQ2xGLGVBQWEsQ0FBQ0osUUFBTSxFQUFFLElBQUksQ0FDNUIsQ0FBQyxHQUNESSxlQUFhLENBQ1hSLEtBQUcsRUFDSDtFQUNFMkYsSUFBQUEsTUFBTSxFQUFFLFNBQVM7RUFDakJOLElBQUFBLE9BQU8sRUFBRSxPQUFPO0VBQ2hCTyxJQUFBQSxDQUFDLEVBQUUsSUFBSTtFQUNQVixJQUFBQSxLQUFLLEVBQUU7RUFBRVcsTUFBQUEsU0FBUyxFQUFFLE1BQU07RUFBRUMsTUFBQUEsU0FBUyxFQUFFO0VBQU87S0FDL0MsRUFDRDFELFFBQVEsQ0FBQzJELE1BQU0sS0FBSyxDQUFDLEdBQ2pCdkYsZUFBYSxDQUFDSCxNQUFJLEVBQUUsSUFBSSxFQUFFLGlCQUFpQixDQUFDLEdBQzVDK0IsUUFBUSxDQUFDNEQsR0FBRyxDQUFFdkksQ0FBYyxJQUMxQitDLGVBQWEsQ0FDWFIsS0FBRyxFQUNIO01BQ0VpRyxHQUFHLEVBQUV4SSxDQUFDLENBQUNpQixFQUFFO0VBQ1RxRyxJQUFBQSxFQUFFLEVBQUUsU0FBUztFQUNiYSxJQUFBQSxDQUFDLEVBQUUsU0FBUztFQUNaRCxJQUFBQSxNQUFNLEVBQUUsU0FBUztFQUNqQk8sSUFBQUEsWUFBWSxFQUFFO0VBQ2hCLEdBQUMsRUFDRDFGLGVBQWEsQ0FDWEgsTUFBSSxFQUNKO0VBQUU4RixJQUFBQSxRQUFRLEVBQUUsSUFBSTtFQUFFcEIsSUFBQUEsRUFBRSxFQUFFO0VBQUssR0FBQyxFQUM1QnZFLGVBQWEsQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFL0MsQ0FBQyxDQUFDMkksVUFBVSxDQUFDLEVBQzNDLEtBQUssRUFDTHhJLGVBQWUsQ0FBQ0gsQ0FBQyxDQUFDeUIsU0FBUyxDQUM3QixDQUFDLEVBQ0RzQixlQUFhLENBQUNILE1BQUksRUFBRSxJQUFJLEVBQUU1QyxDQUFDLENBQUNzRyxPQUFPLENBQ3JDLENBQ0YsQ0FBQyxFQUNMdkQsZUFBYSxDQUFDLEtBQUssRUFBRTtFQUFFNkYsSUFBQUEsR0FBRyxFQUFFM0Q7RUFBZSxHQUFDLENBQzlDLENBQUM7RUFFTCxFQUFBLE1BQU00RCxRQUFRLEdBQUc5RixlQUFhLENBQzVCUixLQUFHLEVBQ0g7RUFBRXVHLElBQUFBLEVBQUUsRUFBRTtFQUFLLEdBQUMsRUFDWi9GLGVBQWEsQ0FBQ0YsUUFBUSxFQUFFO0VBQ3RCakQsSUFBQUEsS0FBSyxFQUFFaUYsS0FBSztFQUNaa0UsSUFBQUEsUUFBUSxFQUFHMUMsQ0FBTSxJQUFLdkIsUUFBUSxDQUFDZixNQUFNLENBQUNzQyxDQUFDLEVBQUUyQyxNQUFNLEVBQUVwSixLQUFLLElBQUksRUFBRSxDQUFDLENBQUM7RUFDOURxSixJQUFBQSxXQUFXLEVBQUUsaUJBQWlCO0VBQzlCbkIsSUFBQUEsUUFBUSxFQUFFL0M7RUFDWixHQUFDLENBQUMsRUFDRmhDLGVBQWEsQ0FDWFIsS0FBRyxFQUNIO0VBQUV1RyxJQUFBQSxFQUFFLEVBQUUsU0FBUztFQUFFMUIsSUFBQUEsSUFBSSxFQUFFO0VBQUssR0FBQyxFQUM3QnJFLGVBQWEsQ0FDWFAsUUFBTSxFQUNOO0VBQ0VvRixJQUFBQSxPQUFPLEVBQUUsV0FBVztFQUNwQkMsSUFBQUEsT0FBTyxFQUFFZCxVQUFVO01BQ25CZSxRQUFRLEVBQUUvQyxPQUFPLElBQUlGLEtBQUssQ0FBQ1IsSUFBSSxFQUFFLENBQUNpRSxNQUFNLEtBQUs7RUFDL0MsR0FBQyxFQUNEdkQsT0FBTyxHQUFHaEMsZUFBYSxDQUFDTCxNQUFJLEVBQUU7RUFBRXdHLElBQUFBLElBQUksRUFBRSxRQUFRO0VBQUVDLElBQUFBLElBQUksRUFBRTtFQUFLLEdBQUMsQ0FBQyxHQUFHLElBQUksRUFDcEUsTUFDRixDQUNGLENBQ0YsQ0FBQztJQUVELE9BQU9wRyxlQUFhLENBQUNOLGFBQWEsRUFBRSxJQUFJLEVBQUUwRSxNQUFNLEVBQUVZLElBQUksRUFBRWMsUUFBUSxDQUFDO0VBQ25FLENBQUM7O0VDN1RELE1BQU07SUFBRXRHLEdBQUc7SUFBRUMsTUFBTTtJQUFFRSxJQUFJO0lBQUVDLE1BQU07RUFBRUMsRUFBQUE7RUFBSyxDQUFDLEdBQUdFLG1CQUFtQjtFQUMvRCxNQUFNO0lBQUVDLGFBQWE7SUFBRUMsV0FBVztJQUFFRSxPQUFPO0VBQUVFLEVBQUFBO0VBQVMsQ0FBQyxHQUFHQyxLQUFLO0VBRS9ELE1BQU0rRiwyQkFBMkIsR0FBSTdGLEtBQVUsSUFBSztJQUNsRCxNQUFNO01BQUVDLFFBQVE7RUFBRUMsSUFBQUE7RUFBTyxHQUFDLEdBQUdGLEtBQUs7RUFDbEMsRUFBQSxNQUFNRyxTQUFTLEdBQUdDLE9BQU8sQ0FBQ0MsU0FBUyxFQUFFO0VBQ3JDLEVBQUEsTUFBTUMsR0FBRyxHQUFHWCxPQUFPLENBQUMsTUFBTSxJQUFJUyxPQUFPLENBQUNHLFNBQVMsRUFBRSxFQUFFLEVBQUUsQ0FBQztFQUV0RCxFQUFBLE1BQU1NLFVBQVUsR0FBR1osUUFBUSxFQUFFdkMsRUFBd0I7RUFDckQsRUFBQSxNQUFNc0QsUUFBUSxHQUFHZCxNQUFNLEVBQUV4QyxFQUF3QjtJQUVqRCxNQUFNLENBQUN3RCxPQUFPLEVBQUVDLFVBQVUsQ0FBQyxHQUFHdEIsUUFBUSxDQUFDLEtBQUssQ0FBQztFQUU3QyxFQUFBLE1BQU1pRyxZQUFZLEdBQUdyRyxXQUFXLENBQUMsWUFBWTtFQUMzQyxJQUFBLElBQUksQ0FBQ29CLFVBQVUsSUFBSSxDQUFDRyxRQUFRLEVBQUU7TUFFOUJHLFVBQVUsQ0FBQyxJQUFJLENBQUM7TUFDaEIsSUFBSTtFQUNGLE1BQUEsTUFBTW9CLElBQUksR0FBRyxNQUFNakMsR0FBRyxDQUFDa0MsWUFBWSxDQUFDO1VBQ2xDM0IsVUFBVTtVQUNWRyxRQUFRO0VBQ1J5QixRQUFBQSxVQUFVLEVBQUUsWUFBWTtFQUN4QkMsUUFBQUEsSUFBSSxFQUFFO0VBQUVDLFVBQUFBLEVBQUUsRUFBRTtFQUFXO0VBQ3pCLE9BQUMsQ0FBQztFQUVGLE1BQUEsTUFBTUQsSUFBSSxHQUFJSCxJQUFJLEVBQUVHLElBQUksSUFBSSxFQUFtQjtRQUMvQyxJQUFJQSxJQUFJLENBQUNFLE1BQU0sRUFBRXpDLFNBQVMsQ0FBQ3VDLElBQUksQ0FBQ0UsTUFBTSxDQUFDO0VBRXZDLE1BQUEsTUFBTU8sR0FBRyxHQUFHLE9BQU9ULElBQUksQ0FBQ1UsV0FBVyxLQUFLLFFBQVEsR0FBR1YsSUFBSSxDQUFDVSxXQUFXLEdBQUcsRUFBRTtRQUN4RSxJQUFJLENBQUNELEdBQUcsRUFBRTtFQUNSaEQsUUFBQUEsU0FBUyxDQUFDO0VBQUU0QyxVQUFBQSxPQUFPLEVBQUUsaUJBQWlCO0VBQUVDLFVBQUFBLElBQUksRUFBRTtFQUFRLFNBQUMsQ0FBQztFQUN4RCxRQUFBO0VBQ0YsTUFBQTtRQUVBLE1BQU1LLE1BQU0sR0FBRzVDLE1BQU0sQ0FBQzZDLElBQUksQ0FBQ0gsR0FBRyxFQUFFLFFBQVEsRUFBRSxxQkFBcUIsQ0FBQztRQUNoRSxJQUFJLENBQUNFLE1BQU0sRUFBRTtFQUNYO0VBQ0E1QyxRQUFBQSxNQUFNLENBQUNDLFFBQVEsQ0FBQzZDLElBQUksR0FBR0osR0FBRztFQUM1QixNQUFBO01BQ0YsQ0FBQyxDQUFDLE9BQU9MLENBQU0sRUFBRTtRQUNmLE1BQU1DLE9BQU8sR0FBR0QsQ0FBQyxZQUFZbEUsS0FBSyxHQUFHa0UsQ0FBQyxDQUFDQyxPQUFPLEdBQUcsdUJBQXVCO0VBQ3hFNUMsTUFBQUEsU0FBUyxDQUFDO1VBQUU0QyxPQUFPO0VBQUVDLFFBQUFBLElBQUksRUFBRTtFQUFRLE9BQUMsQ0FBQztFQUN2QyxJQUFBLENBQUMsU0FBUztRQUNSN0IsVUFBVSxDQUFDLEtBQUssQ0FBQztFQUNuQixJQUFBO0lBQ0YsQ0FBQyxFQUFFLENBQUNoQixTQUFTLEVBQUVHLEdBQUcsRUFBRVUsUUFBUSxFQUFFSCxVQUFVLENBQUMsQ0FBQztJQUUxQyxPQUFPckIsYUFBYSxDQUNsQlIsR0FBRyxFQUNIO0VBQUVxRixJQUFBQSxPQUFPLEVBQUUsT0FBTztFQUFFTSxJQUFBQSxNQUFNLEVBQUUsU0FBUztFQUFFQyxJQUFBQSxDQUFDLEVBQUU7RUFBSyxHQUFDLEVBQ2hEcEYsYUFBYSxDQUFDSCxJQUFJLEVBQUU7RUFBRTRFLElBQUFBLFVBQVUsRUFBRSxNQUFNO0VBQUVGLElBQUFBLEVBQUUsRUFBRTtFQUFVLEdBQUMsRUFBRSxhQUFhLENBQUMsRUFDekV2RSxhQUFhLENBQ1hILElBQUksRUFDSjtFQUFFMEUsSUFBQUEsRUFBRSxFQUFFO0VBQUssR0FBQyxFQUNaLDZDQUNGLENBQUMsRUFDRHZFLGFBQWEsQ0FDWFAsTUFBTSxFQUNOO0VBQUVvRixJQUFBQSxPQUFPLEVBQUUsV0FBVztFQUFFQyxJQUFBQSxPQUFPLEVBQUV3QixZQUFZO0VBQUV2QixJQUFBQSxRQUFRLEVBQUVyRDtFQUFRLEdBQUMsRUFDbEVBLE9BQU8sR0FBRzFCLGFBQWEsQ0FBQ0osTUFBTSxFQUFFO0VBQUUyRyxJQUFBQSxJQUFJLEVBQUU7RUFBRyxHQUFDLENBQUMsR0FBRyxJQUFJLEVBQ3BEN0UsT0FBTyxHQUFHLFVBQVUsR0FBRyxvQkFBb0IsRUFDM0NBLE9BQU8sR0FBRyxJQUFJLEdBQUcxQixhQUFhLENBQUNMLElBQUksRUFBRTtFQUFFd0csSUFBQUEsSUFBSSxFQUFFO0tBQWdCLENBQy9ELENBQ0YsQ0FBQztFQUNILENBQUM7O0VDdkVELE1BQU1LLElBQUksR0FBR0EsQ0FBQztJQUFFQyxRQUFRO0lBQUUvRixNQUFNO0VBQUVzRixFQUFBQTtFQUFTLENBQUMsS0FBSztJQUM3QyxNQUFNO0VBQUVVLElBQUFBO0tBQW1CLEdBQUdDLHNCQUFjLEVBQUU7SUFDOUMsTUFBTTtFQUFFbEYsSUFBQUE7RUFBTyxHQUFDLEdBQUdmLE1BQU07SUFDekIsTUFBTTtFQUFFa0csSUFBQUE7RUFBTyxHQUFDLEdBQUdILFFBQVE7SUFDM0IsTUFBTUksSUFBSSxHQUFHQyxZQUFJLENBQUNDLEdBQUcsQ0FBQ3RGLE1BQU0sRUFBRW1GLE1BQU0sQ0FBQ0ksZ0JBQWdCLENBQUM7SUFDdEQsTUFBTXZCLEdBQUcsR0FBR3FCLFlBQUksQ0FBQ0MsR0FBRyxDQUFDdEYsTUFBTSxFQUFFbUYsTUFBTSxDQUFDSyxXQUFXLENBQUM7SUFDaEQsTUFBTUMsSUFBSSxHQUFHSixZQUFJLENBQUNDLEdBQUcsQ0FBQ3RGLE1BQU0sRUFBRW1GLE1BQU0sQ0FBQ08sWUFBWSxDQUFDO0lBQ2xELE1BQU0sQ0FBQ0MsV0FBVyxFQUFFQyxjQUFjLENBQUMsR0FBR2hILGdCQUFRLENBQUNvRixHQUFHLENBQUM7SUFDbkQsTUFBTSxDQUFDNkIsYUFBYSxFQUFFQyxnQkFBZ0IsQ0FBQyxHQUFHbEgsZ0JBQVEsQ0FBQyxFQUFFLENBQUM7RUFDdERILEVBQUFBLGlCQUFTLENBQUMsTUFBTTtFQUNaO0VBQ0E7RUFDQTtFQUNBLElBQUEsSUFBSyxPQUFPdUYsR0FBRyxLQUFLLFFBQVEsSUFBSUEsR0FBRyxLQUFLMkIsV0FBVyxJQUMzQyxPQUFPM0IsR0FBRyxLQUFLLFFBQVEsSUFBSSxDQUFDMkIsV0FBWSxJQUN4QyxPQUFPM0IsR0FBRyxLQUFLLFFBQVEsSUFBSXJILEtBQUssQ0FBQ2lFLE9BQU8sQ0FBQ29ELEdBQUcsQ0FBQyxJQUFJQSxHQUFHLENBQUNGLE1BQU0sS0FBSzZCLFdBQVcsQ0FBQzdCLE1BQU8sRUFBRTtRQUN6RjhCLGNBQWMsQ0FBQzVCLEdBQUcsQ0FBQztRQUNuQjhCLGdCQUFnQixDQUFDLEVBQUUsQ0FBQztFQUN4QixJQUFBO0VBQ0osRUFBQSxDQUFDLEVBQUUsQ0FBQzlCLEdBQUcsRUFBRTJCLFdBQVcsQ0FBQyxDQUFDO0lBQ3RCLE1BQU1JLFFBQVEsR0FBSUMsS0FBSyxJQUFLO01BQ3hCRixnQkFBZ0IsQ0FBQ0UsS0FBSyxDQUFDO0VBQ3ZCekIsSUFBQUEsUUFBUSxDQUFDWSxNQUFNLENBQUNPLFlBQVksRUFBRU0sS0FBSyxDQUFDO0lBQ3hDLENBQUM7SUFDRCxNQUFNQyxZQUFZLEdBQUdBLE1BQU07RUFDdkIxQixJQUFBQSxRQUFRLENBQUNZLE1BQU0sQ0FBQ08sWUFBWSxFQUFFLElBQUksQ0FBQztJQUN2QyxDQUFDO0lBQ0QsTUFBTVEsaUJBQWlCLEdBQUlDLFNBQVMsSUFBSztNQUNyQyxNQUFNQyxLQUFLLEdBQUcsQ0FBQ2YsWUFBSSxDQUFDQyxHQUFHLENBQUNyRyxNQUFNLENBQUNlLE1BQU0sRUFBRW1GLE1BQU0sQ0FBQ0ssV0FBVyxDQUFDLElBQUksRUFBRSxFQUFFYSxPQUFPLENBQUNGLFNBQVMsQ0FBQztFQUNwRixJQUFBLE1BQU1HLGFBQWEsR0FBR2pCLFlBQUksQ0FBQ0MsR0FBRyxDQUFDckcsTUFBTSxDQUFDZSxNQUFNLEVBQUVtRixNQUFNLENBQUNvQixxQkFBcUIsQ0FBQyxJQUFJLEVBQUU7RUFDakYsSUFBQSxJQUFJbkIsSUFBSSxJQUFJQSxJQUFJLENBQUN0QixNQUFNLEdBQUcsQ0FBQyxFQUFFO0VBQ3pCLE1BQUEsTUFBTTBDLE9BQU8sR0FBR3BCLElBQUksQ0FBQ3JCLEdBQUcsQ0FBQyxDQUFDMEMsV0FBVyxFQUFFQyxDQUFDLEtBQU1BLENBQUMsS0FBS04sS0FBSyxHQUFHSyxXQUFXLEdBQUcsSUFBSyxDQUFDO1FBQ2hGLElBQUlFLFNBQVMsR0FBR3RCLFlBQUksQ0FBQzdJLEdBQUcsQ0FBQ3lDLE1BQU0sQ0FBQ2UsTUFBTSxFQUFFbUYsTUFBTSxDQUFDb0IscUJBQXFCLEVBQUUsQ0FBQyxHQUFHRCxhQUFhLEVBQUVGLEtBQUssQ0FBQyxDQUFDO0VBQ2hHTyxNQUFBQSxTQUFTLEdBQUd0QixZQUFJLENBQUM3SSxHQUFHLENBQUNtSyxTQUFTLEVBQUV4QixNQUFNLENBQUNJLGdCQUFnQixFQUFFaUIsT0FBTyxDQUFDO0VBQ2pFakMsTUFBQUEsUUFBUSxDQUFDO0VBQ0wsUUFBQSxHQUFHdEYsTUFBTTtFQUNUZSxRQUFBQSxNQUFNLEVBQUUyRztFQUNaLE9BQUMsQ0FBQztFQUNOLElBQUEsQ0FBQyxNQUNJO0VBQ0Q7RUFDQUMsTUFBQUEsT0FBTyxDQUFDQyxHQUFHLENBQUMsNkRBQTZELENBQUM7RUFDOUUsSUFBQTtJQUNKLENBQUM7RUFDRCxFQUFBLG9CQUFRaEksc0JBQUssQ0FBQ04sYUFBYSxDQUFDdUksc0JBQVMsRUFBRSxJQUFJLGVBQ3ZDakksc0JBQUssQ0FBQ04sYUFBYSxDQUFDd0ksa0JBQUssRUFBRSxJQUFJLEVBQUU5QixpQkFBaUIsQ0FBQ0QsUUFBUSxDQUFDM0gsS0FBSyxFQUFFMkgsUUFBUSxDQUFDcEYsVUFBVSxDQUFDLENBQUMsZUFDeEZmLHNCQUFLLENBQUNOLGFBQWEsQ0FBQ3lJLHFCQUFRLEVBQUU7RUFBRXpDLElBQUFBLFFBQVEsRUFBRXdCLFFBQVE7TUFBRWtCLFFBQVEsRUFBRTlCLE1BQU0sQ0FBQzhCLFFBQVE7RUFBRUMsSUFBQUEsUUFBUSxFQUFFO1FBQ2pGQyxTQUFTLEVBQUVoQyxNQUFNLENBQUNnQyxTQUFTO1FBQzNCQyxPQUFPLEVBQUVqQyxNQUFNLENBQUNpQztPQUNuQjtFQUFFcEIsSUFBQUEsS0FBSyxFQUFFSDtLQUFlLENBQUMsRUFDOUIsQ0FBQ1YsTUFBTSxDQUFDOEIsUUFBUSxJQUFJakQsR0FBRyxJQUFJb0IsSUFBSSxJQUFJLENBQUNTLGFBQWEsQ0FBQy9CLE1BQU0sSUFBSTJCLElBQUksS0FBSyxJQUFJLGtCQUFLNUcsc0JBQUssQ0FBQ04sYUFBYSxDQUFDOEkseUJBQVksRUFBRTtFQUFFQyxJQUFBQSxRQUFRLEVBQUV0RCxHQUFHO0VBQUV1RCxJQUFBQSxHQUFHLEVBQUVuQyxJQUFJO0VBQUVvQyxJQUFBQSxRQUFRLEVBQUV2QjtFQUFhLEdBQUMsQ0FBQyxDQUFDLEVBQ3RLZCxNQUFNLENBQUM4QixRQUFRLElBQUlqRCxHQUFHLElBQUlBLEdBQUcsQ0FBQ0YsTUFBTSxJQUFJc0IsSUFBSSxpQkFBSXZHLHNCQUFLLENBQUNOLGFBQWEsQ0FBQ00sc0JBQUssQ0FBQzRJLFFBQVEsRUFBRSxJQUFJLEVBQUV6RCxHQUFHLENBQUNELEdBQUcsQ0FBQyxDQUFDb0MsU0FBUyxFQUFFQyxLQUFLLEtBQUs7RUFDcEg7RUFDQTtFQUNBO0VBQ0E7RUFDQSxJQUFBLE1BQU1LLFdBQVcsR0FBR3JCLElBQUksQ0FBQ2dCLEtBQUssQ0FBQztFQUMvQixJQUFBLE9BQU9LLFdBQVcsaUJBQUk1SCxzQkFBSyxDQUFDTixhQUFhLENBQUM4SSx5QkFBWSxFQUFFO0VBQUVyRCxNQUFBQSxHQUFHLEVBQUVtQyxTQUFTO0VBQUVtQixNQUFBQSxRQUFRLEVBQUVuQixTQUFTO0VBQUVvQixNQUFBQSxHQUFHLEVBQUVuQyxJQUFJLENBQUNnQixLQUFLLENBQUM7RUFBRW9CLE1BQUFBLFFBQVEsRUFBRUEsTUFBTXRCLGlCQUFpQixDQUFDQyxTQUFTO09BQUcsQ0FBQyxJQUFJLEVBQUU7RUFDMUssRUFBQSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztFQUNsQixDQUFDOztFQzlETSxNQUFNdUIsY0FBYyxHQUFHLENBQzFCLFdBQVcsRUFDWCxZQUFZLEVBQ1osY0FBYyxFQUNkLFlBQVksRUFDWixXQUFXLEVBQ1gsaUJBQWlCLEVBQ2pCLFlBQVksRUFDWixXQUFXLEVBQ1gsWUFBWSxFQUNaLGFBQWEsQ0FDaEI7RUFVTSxNQUFNQyxjQUFjLEdBQUcsQ0FDMUIsV0FBVyxFQUNYLFdBQVcsRUFDWCxZQUFZLEVBQ1osV0FBVyxFQUNYLGVBQWUsRUFDZiwwQkFBMEIsRUFDMUIsWUFBWSxFQUNaLFlBQVksQ0FDZjs7RUM5QkQ7RUFLQSxNQUFNQyxVQUFVLEdBQUk3SSxLQUFLLElBQUs7SUFDMUIsTUFBTTtNQUFFZ0MsSUFBSTtNQUFFcUUsSUFBSTtNQUFFeUMsUUFBUTtFQUFFQyxJQUFBQTtFQUFNLEdBQUMsR0FBRy9JLEtBQUs7RUFDN0MsRUFBQSxJQUFJcUcsSUFBSSxJQUFJQSxJQUFJLENBQUN0QixNQUFNLEVBQUU7TUFDckIsSUFBSStELFFBQVEsSUFBSUYsY0FBYyxDQUFDSSxRQUFRLENBQUNGLFFBQVEsQ0FBQyxFQUFFO0VBQy9DLE1BQUEsb0JBQVFoSixzQkFBSyxDQUFDTixhQUFhLENBQUMsS0FBSyxFQUFFO0VBQUVnSixRQUFBQSxHQUFHLEVBQUVuQyxJQUFJO0VBQUVuQyxRQUFBQSxLQUFLLEVBQUU7RUFBRVcsVUFBQUEsU0FBUyxFQUFFa0UsS0FBSztFQUFFRSxVQUFBQSxRQUFRLEVBQUVGO1dBQU87RUFBRUcsUUFBQUEsR0FBRyxFQUFFbEg7RUFBSyxPQUFDLENBQUM7RUFDOUcsSUFBQTtNQUNBLElBQUk4RyxRQUFRLElBQUlILGNBQWMsQ0FBQ0ssUUFBUSxDQUFDRixRQUFRLENBQUMsRUFBRTtFQUMvQyxNQUFBLG9CQUFRaEosc0JBQUssQ0FBQ04sYUFBYSxDQUFDLE9BQU8sRUFBRTtFQUFFMkosUUFBQUEsUUFBUSxFQUFFLElBQUk7RUFBRVgsUUFBQUEsR0FBRyxFQUFFbkM7RUFBSyxPQUFDLEVBQzlELG1DQUFtQyxlQUNuQ3ZHLHNCQUFLLENBQUNOLGFBQWEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxlQUMxQ00sc0JBQUssQ0FBQ04sYUFBYSxDQUFDLE9BQU8sRUFBRTtFQUFFNEosUUFBQUEsSUFBSSxFQUFFO0VBQVcsT0FBQyxDQUFDLENBQUM7RUFDM0QsSUFBQTtFQUNKLEVBQUE7RUFDQSxFQUFBLG9CQUFRdEosc0JBQUssQ0FBQ04sYUFBYSxDQUFDUixnQkFBRyxFQUFFLElBQUksZUFDakNjLHNCQUFLLENBQUNOLGFBQWEsQ0FBQ1AsbUJBQU0sRUFBRTtFQUFFb0ssSUFBQUEsRUFBRSxFQUFFLEdBQUc7RUFBRTlGLElBQUFBLElBQUksRUFBRThDLElBQUk7RUFBRWlELElBQUFBLEVBQUUsRUFBRSxTQUFTO0VBQUV2RCxJQUFBQSxJQUFJLEVBQUUsSUFBSTtFQUFFd0QsSUFBQUEsT0FBTyxFQUFFLElBQUk7RUFBRTlELElBQUFBLE1BQU0sRUFBRTtFQUFTLEdBQUMsZUFDM0czRixzQkFBSyxDQUFDTixhQUFhLENBQUNMLGlCQUFJLEVBQUU7RUFBRXdHLElBQUFBLElBQUksRUFBRSxrQkFBa0I7RUFBRTZELElBQUFBLEtBQUssRUFBRSxPQUFPO0VBQUVDLElBQUFBLEVBQUUsRUFBRTtFQUFVLEdBQUMsQ0FBQyxFQUN0RnpILElBQUksQ0FBQyxDQUFDO0VBQ2xCLENBQUM7RUFDRCxNQUFNMEgsSUFBSSxHQUFHQSxDQUFDO0lBQUVYLEtBQUs7SUFBRTdJLE1BQU07RUFBRStGLEVBQUFBO0VBQVMsQ0FBQyxLQUFLO0lBQzFDLE1BQU07RUFBRUcsSUFBQUE7RUFBTyxHQUFDLEdBQUdILFFBQVE7RUFDM0IsRUFBQSxJQUFJSSxJQUFJLEdBQUdDLFlBQUksQ0FBQ0MsR0FBRyxDQUFDckcsTUFBTSxFQUFFZSxNQUFNLEVBQUVtRixNQUFNLENBQUNJLGdCQUFnQixDQUFDO0lBQzVELElBQUksQ0FBQ0gsSUFBSSxFQUFFO0VBQ1AsSUFBQSxPQUFPLElBQUk7RUFDZixFQUFBO0lBQ0EsTUFBTXJFLElBQUksR0FBR3NFLFlBQUksQ0FBQ0MsR0FBRyxDQUFDckcsTUFBTSxFQUFFZSxNQUFNLEVBQUVtRixNQUFNLENBQUN1RCxnQkFBZ0IsR0FBR3ZELE1BQU0sQ0FBQ3VELGdCQUFnQixHQUFHdkQsTUFBTSxDQUFDSyxXQUFXLENBQUM7RUFDN0csRUFBQSxNQUFNcUMsUUFBUSxHQUFHMUMsTUFBTSxDQUFDd0QsZ0JBQWdCLElBQ2pDdEQsWUFBSSxDQUFDQyxHQUFHLENBQUNyRyxNQUFNLEVBQUVlLE1BQU0sRUFBRW1GLE1BQU0sQ0FBQ3dELGdCQUFnQixDQUFDO0VBQ3hELEVBQUEsSUFBSSxDQUFDM0QsUUFBUSxDQUFDRyxNQUFNLENBQUM4QixRQUFRLEVBQUU7TUFDM0IsSUFBSTlCLE1BQU0sQ0FBQ3lELElBQUksSUFBSXpELE1BQU0sQ0FBQ3lELElBQUksQ0FBQ0MsT0FBTyxFQUFFO1FBQ3BDekQsSUFBSSxHQUFHLEdBQUdELE1BQU0sQ0FBQ3lELElBQUksQ0FBQ0MsT0FBTyxDQUFBLENBQUEsRUFBSTlILElBQUksQ0FBQSxDQUFFO0VBQzNDLElBQUE7RUFDQSxJQUFBLG9CQUFRbEMsc0JBQUssQ0FBQ04sYUFBYSxDQUFDcUosVUFBVSxFQUFFO0VBQUV4QyxNQUFBQSxJQUFJLEVBQUVBLElBQUk7RUFBRXJFLE1BQUFBLElBQUksRUFBRUEsSUFBSTtFQUFFK0csTUFBQUEsS0FBSyxFQUFFQSxLQUFLO0VBQUVELE1BQUFBLFFBQVEsRUFBRUE7RUFBUyxLQUFDLENBQUM7RUFDekcsRUFBQTtJQUNBLElBQUkxQyxNQUFNLENBQUN5RCxJQUFJLElBQUl6RCxNQUFNLENBQUN5RCxJQUFJLENBQUNDLE9BQU8sRUFBRTtNQUNwQyxNQUFNQSxPQUFPLEdBQUcxRCxNQUFNLENBQUN5RCxJQUFJLENBQUNDLE9BQU8sSUFBSSxFQUFFO0VBQ3pDekQsSUFBQUEsSUFBSSxHQUFHQSxJQUFJLENBQUNyQixHQUFHLENBQUMsQ0FBQytFLFVBQVUsRUFBRTFDLEtBQUssS0FBSyxDQUFBLEVBQUd5QyxPQUFPLENBQUEsQ0FBQSxFQUFJOUgsSUFBSSxDQUFDcUYsS0FBSyxDQUFDLEVBQUUsQ0FBQztFQUN2RSxFQUFBO0lBQ0Esb0JBQVF2SCxzQkFBSyxDQUFDTixhQUFhLENBQUNNLHNCQUFLLENBQUM0SSxRQUFRLEVBQUUsSUFBSSxFQUFFckMsSUFBSSxDQUFDckIsR0FBRyxDQUFDLENBQUMrRSxVQUFVLEVBQUUxQyxLQUFLLG1CQUFNdkgsc0JBQUssQ0FBQ04sYUFBYSxDQUFDcUosVUFBVSxFQUFFO0VBQUU1RCxJQUFBQSxHQUFHLEVBQUU4RSxVQUFVO0VBQUUxRCxJQUFBQSxJQUFJLEVBQUUwRCxVQUFVO0VBQUUvSCxJQUFBQSxJQUFJLEVBQUVBLElBQUksQ0FBQ3FGLEtBQUssQ0FBQztFQUFFMEIsSUFBQUEsS0FBSyxFQUFFQSxLQUFLO01BQUVELFFBQVEsRUFBRUEsUUFBUSxDQUFDekIsS0FBSztLQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDNU4sQ0FBQzs7RUN6Q0QsTUFBTTJDLElBQUksR0FBSWhLLEtBQUssa0JBQU1GLHNCQUFLLENBQUNOLGFBQWEsQ0FBQ2tLLElBQUksRUFBRTtFQUFFWCxFQUFBQSxLQUFLLEVBQUUsR0FBRztJQUFFLEdBQUcvSTtFQUFNLENBQUMsQ0FBQyxDQUFDOztFQ0U3RSxNQUFNaUssSUFBSSxHQUFJakssS0FBSyxJQUFLO0lBQ3BCLE1BQU07RUFBRWlHLElBQUFBO0VBQVMsR0FBQyxHQUFHakcsS0FBSztJQUMxQixNQUFNO0VBQUVrRyxJQUFBQTtLQUFtQixHQUFHQyxzQkFBYyxFQUFFO0VBQzlDLEVBQUEsb0JBQVFyRyxzQkFBSyxDQUFDTixhQUFhLENBQUN1SSxzQkFBUyxFQUFFLElBQUksZUFDdkNqSSxzQkFBSyxDQUFDTixhQUFhLENBQUN3SSxrQkFBSyxFQUFFLElBQUksRUFBRTlCLGlCQUFpQixDQUFDRCxRQUFRLENBQUMzSCxLQUFLLEVBQUUySCxRQUFRLENBQUNwRixVQUFVLENBQUMsQ0FBQyxlQUN4RmYsc0JBQUssQ0FBQ04sYUFBYSxDQUFDa0ssSUFBSSxFQUFFO0VBQUVYLElBQUFBLEtBQUssRUFBRSxNQUFNO01BQUUsR0FBRy9JO0VBQU0sR0FBQyxDQUFDLENBQUM7RUFDL0QsQ0FBQzs7RUNWREksT0FBTyxDQUFDOEosY0FBYyxHQUFHLEVBQUU7RUFFM0I5SixPQUFPLENBQUM4SixjQUFjLENBQUNuSyxxQkFBcUIsR0FBR0EscUJBQXFCO0VBRXBFSyxPQUFPLENBQUM4SixjQUFjLENBQUNyRSwyQkFBMkIsR0FBR0EsMkJBQTJCO0VBRWhGekYsT0FBTyxDQUFDOEosY0FBYyxDQUFDQyxtQkFBbUIsR0FBR0EsSUFBbUI7RUFFaEUvSixPQUFPLENBQUM4SixjQUFjLENBQUNFLG1CQUFtQixHQUFHQSxJQUFtQjtFQUVoRWhLLE9BQU8sQ0FBQzhKLGNBQWMsQ0FBQ0csbUJBQW1CLEdBQUdBLElBQW1COzs7Ozs7IiwieF9nb29nbGVfaWdub3JlTGlzdCI6WzIsMyw0LDUsNl19
