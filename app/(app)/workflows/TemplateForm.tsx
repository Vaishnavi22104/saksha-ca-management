"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms";
import { StepCounts, StepFlow } from "@/components/WorkflowVisuals";
import { BLANK_STEP, PRESETS, type Preset } from "@/lib/workflowPresets";
import type { WorkflowStep } from "@/lib/types";
import { createTemplateAction, updateTemplateAction } from "./actions";

type Option = { id: string; name: string };
type Draft = { title: string; requires_document: boolean; requires_review: boolean; due_offset_days: number };

const toDraft = (s: WorkflowStep): Draft => ({
  title: s.title,
  requires_document: s.requires_document,
  requires_review: s.requires_review,
  due_offset_days: s.due_offset_days,
});

/**
 * Used for both creating and editing.
 *
 * Steps are still ordinary form fields repeated once per row, so the form
 * submits without JavaScript; the buttons only add, remove and reorder rows.
 * The checkbox `value` is the row's current index, which is what
 * stepsFromFormData matches on — so reordering must keep those in sync, and
 * it does, because the index comes from the render.
 */
export function TemplateForm(props: {
  services: Option[];
  template?: { id: string; name: string; service_id: string; description: string | null; steps: WorkflowStep[] };
}) {
  const editing = !!props.template;
  const [state, formAction] = useActionState(editing ? updateTemplateAction : createTemplateAction, {});
  const [steps, setSteps] = useState<Draft[]>(
    props.template?.steps.length ? props.template.steps.map(toDraft) : [{ ...BLANK_STEP }],
  );
  const [serviceId, setServiceId] = useState(props.template?.service_id ?? props.services[0]?.id ?? "");
  const [name, setName] = useState(props.template?.name ?? "");
  const [usedPreset, setUsedPreset] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Draft>) =>
    setSteps((rows) => rows.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  const remove = (i: number) => setSteps((rows) => (rows.length > 1 ? rows.filter((_, j) => j !== i) : rows));
  const add = () => setSteps((rows) => (rows.length < 30 ? [...rows, { ...BLANK_STEP }] : rows));
  const move = (i: number, by: number) =>
    setSteps((rows) => {
      const to = i + by;
      if (to < 0 || to >= rows.length) return rows;
      const copy = [...rows];
      [copy[i], copy[to]] = [copy[to], copy[i]];
      return copy;
    });

  /** Fills the builder from an outline. Only offered while creating. */
  const applyPreset = (p: Preset) => {
    setSteps(p.steps.map((s) => ({ ...s })));
    setUsedPreset(p.key);
    if (!name) setName(p.name);
    const guess = props.services.find((s) => s.name.toLowerCase().includes(p.match));
    if (guess) setServiceId(guess.id);
  };

  const filled = steps.filter((s) => s.title.trim() !== "");

  return (
    <form action={formAction} className="wf-build" noValidate>
      {editing && <input type="hidden" name="template_id" value={props.template!.id} />}
      {editing && <input type="hidden" name="service_id" value={props.template!.service_id} />}

      <div className="wf-build-main">
        <FormAlert state={state} />

        {!editing && (
          <section className="panel">
            <div className="panel-h">
              <h2>Start from an outline</h2>
              <span className="muted small">Optional. Everything stays editable.</span>
            </div>
            <div className="panel-b">
              <div className="wf-presets">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`wf-preset${usedPreset === p.key ? " is-on" : ""}`}
                    onClick={() => applyPreset(p)}
                  >
                    <b>{p.name}</b>
                    <span>{p.blurb}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`wf-preset wf-preset-blank${usedPreset === "blank" ? " is-on" : ""}`}
                  onClick={() => { setSteps([{ ...BLANK_STEP }]); setUsedPreset("blank"); }}
                >
                  <b>Blank</b>
                  <span>Write every step yourself.</span>
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel-h">
            <h2>The basics</h2>
          </div>
          <div className="panel-b">
            <div className="fields2">
              <Field label="Template name *" name="name" state={state} hint="For example GST monthly.">
                <input
                  id="f-name"
                  name="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Service *" name="service_id" state={state}>
                <select
                  id="f-service_id"
                  name="service_id"
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  disabled={editing}
                >
                  {props.services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Description" name="description" state={state} hint="Optional. One line on what this cycle covers.">
              <input id="f-description" name="description" type="text" defaultValue={props.template?.description ?? ""} />
            </Field>
          </div>
        </section>

        <section className="panel">
          <div className="panel-h">
            <h2>The steps</h2>
            <span className="muted small">Each step becomes one task when you generate.</span>
          </div>
          <div className="panel-b">
            {state?.fieldErrors?.steps && <div className="notice red" role="alert">{state.fieldErrors.steps}</div>}

            <div className="wf-steps">
              {steps.map((s, i) => (
                <div className={`wf-step${s.title.trim() ? "" : " is-empty"}`} key={i}>
                  <div className="wf-step-n" aria-hidden="true">{i + 1}</div>

                  <div className="wf-step-b">
                    <input
                      className="wf-step-title"
                      aria-label={`Step ${i + 1} title`}
                      name="step_title"
                      type="text"
                      value={s.title}
                      placeholder="What has to happen? e.g. Collect sales invoices"
                      onChange={(e) => update(i, { title: e.target.value })}
                    />

                    <div className="wf-step-opts">
                      <span className="wf-stepper">
                        <button
                          type="button"
                          onClick={() => update(i, { due_offset_days: Math.max(0, s.due_offset_days - 1) })}
                          aria-label={`Step ${i + 1}: one day earlier`}
                        >−</button>
                        <input
                          aria-label={`Step ${i + 1} due offset in days`}
                          name="step_offset"
                          type="number"
                          min={0}
                          max={365}
                          value={s.due_offset_days}
                          onChange={(e) => update(i, { due_offset_days: Math.min(365, Math.max(0, Number(e.target.value) || 0)) })}
                        />
                        <button
                          type="button"
                          onClick={() => update(i, { due_offset_days: Math.min(365, s.due_offset_days + 1) })}
                          aria-label={`Step ${i + 1}: one day later`}
                        >+</button>
                        <em>{s.due_offset_days === 0 ? "on the start date" : "days after the start"}</em>
                      </span>

                      <label className={`wf-toggle${s.requires_document ? " is-on" : ""}`}>
                        <input
                          type="checkbox"
                          name="step_document"
                          value={String(i)}
                          checked={s.requires_document}
                          onChange={(e) => update(i, { requires_document: e.target.checked })}
                        />
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" />
                        </svg>
                        File from client
                      </label>

                      <label className={`wf-toggle${s.requires_review ? " is-on" : ""}`}>
                        <input
                          type="checkbox"
                          name="step_review"
                          value={String(i)}
                          checked={s.requires_review}
                          onChange={(e) => update(i, { requires_review: e.target.checked })}
                        />
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                          <path d="M4 12.5l5 5L20 6.5" />
                        </svg>
                        CA signs off
                      </label>
                    </div>
                  </div>

                  <div className="wf-step-a">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move step ${i + 1} up`}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 14l6-6 6 6" /></svg>
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label={`Move step ${i + 1} down`}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10l6 6 6-6" /></svg>
                    </button>
                    <button type="button" className="wf-x" onClick={() => remove(i)} disabled={steps.length === 1} aria-label={`Remove step ${i + 1}`}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" className="wf-add" onClick={add} disabled={steps.length >= 30}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add a step
            </button>
            <p className="muted small" style={{ margin: "10px 0 0" }}>
              Rows left blank are ignored. Up to 30 steps.
            </p>
          </div>
        </section>
      </div>

      <aside className="wf-build-side">
        <section className="panel wf-preview">
          <div className="panel-h">
            <h2>Preview</h2>
            <span className="muted small">{filled.length ? `${filled.length} tasks` : "empty"}</span>
          </div>
          <div className="panel-b">
            <div className="wf-preview-t">
              <b>{name || "Untitled template"}</b>
              <span>{props.services.find((s) => s.id === serviceId)?.name ?? "No service"}</span>
            </div>

            {filled.length ? (
              <>
                <StepCounts steps={filled} />
                <StepFlow steps={filled} compact />
              </>
            ) : (
              <p className="muted small">
                Add a step, or pick an outline above, and the cycle appears here as it will look to your team.
              </p>
            )}
          </div>
        </section>

        <div className="wf-build-foot">
          <SubmitButton>{editing ? "Save template" : "Create template"}</SubmitButton>
          <Link className="btn" href={editing ? `/workflows/${props.template!.id}` : "/workflows"}>Cancel</Link>
        </div>
      </aside>
    </form>
  );
}
