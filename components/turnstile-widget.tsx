"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  ready: (callback: () => void) => void;
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "light";
      size: "flexible";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("#cloudflare-turnstile-script");
    const script = existing || document.createElement("script");

    const handleLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile indisponível."));
    };
    const handleError = () => reject(new Error("Não foi possível carregar a verificação."));

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existing) {
      script.id = "cloudflare-turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    turnstileScriptPromise = null;
    throw error;
  });

  return turnstileScriptPromise;
}

type TurnstileWidgetProps = {
  onTokenChange: (token: string) => void;
  resetKey: number;
};

export function TurnstileWidget({ onTokenChange, resetKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onTokenChange);
  const [siteKey, setSiteKey] = useState("");
  const [message, setMessage] = useState("Carregando verificação de segurança...");
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    callbackRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/turnstile", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as { siteKey?: string; message?: string };
        if (!response.ok || !result.siteKey) {
          throw new Error(result.message || "A verificação de segurança está indisponível.");
        }
        setSiteKey(result.siteKey);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setHasError(true);
        setMessage(error instanceof Error ? error.message : "A verificação de segurança está indisponível.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    let cancelled = false;
    let widgetId: string | undefined;
    setHasError(false);
    setMessage("Confirme a verificação de segurança para enviar.");
    callbackRef.current("");

    loadTurnstile()
      .then((turnstile) => {
        turnstile.ready(() => {
          if (cancelled || !containerRef.current) return;
          widgetId = turnstile.render(containerRef.current, {
            sitekey: siteKey,
            action: "cadastro_paciente",
            theme: "light",
            size: "flexible",
            callback: (token) => {
              setHasError(false);
              setMessage("Verificação concluída.");
              callbackRef.current(token);
            },
            "expired-callback": () => {
              setMessage("A verificação expirou. Confirme novamente.");
              callbackRef.current("");
            },
            "error-callback": () => {
              setHasError(true);
              setMessage("Não foi possível concluir a verificação. Tente novamente.");
              callbackRef.current("");
            },
          });
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setHasError(true);
        setMessage(error instanceof Error ? error.message : "A verificação de segurança está indisponível.");
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, resetKey]);

  return (
    <div className="space-y-2" aria-live="polite">
      <div ref={containerRef} className="min-h-[65px] w-full max-w-[420px]" />
      <p className={`text-xs leading-5 ${hasError ? "text-red-700" : "text-muted-foreground"}`}>
        {message}
      </p>
    </div>
  );
}
