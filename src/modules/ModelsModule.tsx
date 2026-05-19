import React from "react";
import { Field } from "../components/Field";
import { ModelSelect } from "../components/ModelSelect";
import { Chip } from "../components/Chip";
import { veniceFetch } from "../services/veniceClient";
import { flattenModels } from "../state/appReducer";

export async function refreshModels(dispatch: any) {
  try {
    const { data } = await veniceFetch("/models?type=all", {
      method: "GET",
      dispatch,
      retry: true,
    });
    const grouped = flattenModels(data);
    dispatch({ type: "SET_MODELS", models: grouped, fallback: false });
  } catch (err: any) {
    dispatch({
      type: "SET_MODELS",
      models: undefined,
      fallback: true,
      error:
        err.message ||
        "Model discovery failed; using non-exhaustive static fallbacks.",
    });
  }
}

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
    <section className="content-card">
      <div className="toolbar">
        <div>
          <h2>Models</h2>
          <div className="small muted">
            GET /models grouped by model metadata, type, traits, and ID heuristics.
          </div>
        </div>
        <div className="chip-row">
          <button className="btn" onClick={() => refreshModels(dispatch)}>
            Refresh models
          </button>
          <Chip tone={state.usingFallbackModels ? "warn" : "ok"}>
            {state.usingFallbackModels
              ? "static fallback active"
              : "live discovery active"}
          </Chip>
        </div>
      </div>

      <div className="body grid">
        {state.modelLoadError && (
          <div className="notice small">{state.modelLoadError}</div>
        )}

        <div className="grid two">
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

        <div className="grid three">
          {groups.map((group) => (
            <div className="model-group" key={group}>
              <div
                className="chip-row"
                style={{ justifyContent: "space-between" }}
              >
                <strong>{group}</strong>
                <Chip>{state.models[group]?.length || 0}</Chip>
              </div>
              <div className="model-list">
                {(state.models[group] || []).map((m: any) => (
                  <div className="model-item" key={`${group}-${m.id}`}>
                    <div className="mono small">{m.id}</div>
                    <div className="tiny muted">
                      {m.name || m.display_name || ""}
                    </div>
                    <div className="tiny faint">
                      {m.type || "unknown"}{" "}
                      {m.traits ? " · traits present" : ""}
                    </div>
                  </div>
                ))}
                {!state.models[group]?.length && (
                  <div className="small muted">No models discovered.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
