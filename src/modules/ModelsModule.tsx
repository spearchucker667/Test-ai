import React from "react";
import { Field } from "../components/Field";
import { ModelSelect } from "../components/ModelSelect";
import { Chip } from "../components/Chip";
import { ModelRefreshButton } from "../components/ModelRefreshButton";
export { refreshModels } from "../services/modelService";

export function ModelsModule({ state, dispatch }: { state: any; dispatch: any }) {
  const groups = [
    "text",
    "image",
    "audio",
    "video",
    "embeddings",
    "unknown",
  ];
  return (
    <section className="flex flex-col h-full bg-zinc-950">
      <div className="flex-none p-6 border-b border-white/5 bg-zinc-950/50 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight text-white">Models</h2>
            <div className="text-sm text-zinc-400 mt-1">
              GET /models grouped by model metadata, type, traits, and ID heuristics.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ModelRefreshButton state={state} dispatch={dispatch} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {state.modelLoadError && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {state.modelLoadError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Current chat model">
            <ModelSelect
              value={state.selectedChatModel}
              models={state.models.text}
              onChange={(model) =>
                dispatch({ type: "SET_SELECTED_CHAT_MODEL", model })
              }
            />
          </Field>
          <Field label="Current image model">
            <ModelSelect
              value={state.selectedImageModel}
              models={state.models.image}
              onChange={(model) =>
                dispatch({ type: "SET_SELECTED_IMAGE_MODEL", model })
              }
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group) => (
            <div className="flex flex-col h-full rounded-2xl border border-white/10 bg-white/5 overflow-hidden" key={group}>
              <div className="flex items-center justify-between p-4 border-b border-white/5 bg-black/20">
                <strong className="text-sm font-semibold text-white capitalize">{group}</strong>
                <Chip>{state.models[group]?.length || 0}</Chip>
              </div>
              <div className="flex-1 overflow-y-auto p-2 max-h-[400px] space-y-2">
                {(state.models[group] || []).map((m: any) => (
                  <div className="rounded-xl p-3 bg-black/40 border border-transparent transition-all hover:border-white/10" key={`${group}-${m.id}`}>
                    <div className="font-mono text-xs text-brand-300 font-medium mb-1 break-all">{m.id}</div>
                    <div className="text-xs text-zinc-400">
                      {m.name || m.display_name || ""}
                    </div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider mt-1">
                      {m.type || "unknown"}{" "}
                      {m.traits ? " · traits present" : ""}
                    </div>
                  </div>
                ))}
                {!state.models[group]?.length && (
                  <div className="p-4 text-center text-sm text-zinc-500">No models discovered.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
