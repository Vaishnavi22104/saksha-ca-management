"use client";

import { useActionState, useRef } from "react";
import { Field, SubmitButton, FormAlert } from "@/components/forms";
import { removeAvatarAction, updateProfileAction, uploadAvatarAction } from "./actions";
import type { ActionState, AppUser, Client } from "@/lib/types";

function Initials({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return <span className="av-fallback">{letters}</span>;
}

function AvatarSection({ user }: { user: AppUser }) {
  const [state, action, pending] = useActionState(uploadAvatarAction, {} as ActionState);
  const [removeState, removeAction, removing] = useActionState(removeAvatarAction, {} as ActionState);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="av-section">
      <div className="av-frame" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
        aria-label="Change profile picture"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}>
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="av-img" />
        ) : (
          <Initials name={user.name} />
        )}
        <span className="av-overlay">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </span>
      </div>

      <form action={action}>
        <input ref={fileRef} type="file" name="avatar" accept="image/*" className="sr-only"
          onChange={(e) => { if (e.target.files?.length) e.target.form?.requestSubmit(); }} />
        <button type="button" className="btn sm" onClick={() => fileRef.current?.click()} disabled={pending || removing}>
          {pending ? "Uploading…" : user.avatar_url ? "Change photo" : "Add photo"}
        </button>
      </form>

      {/* Only offered when there is something to remove. */}
      {user.avatar_url && (
        <form action={removeAction}>
          <button
            type="submit"
            className="linkbtn av-remove"
            disabled={removing || pending}
            onClick={(e) => {
              if (!window.confirm("Remove your profile picture?")) e.preventDefault();
            }}
          >
            {removing ? "Removing…" : "Remove photo"}
          </button>
        </form>
      )}

      <FormAlert state={state} />
      <FormAlert state={removeState} />
      <p className="hint" style={{ margin: 0 }}>JPG or PNG, max 2 MB</p>
    </div>
  );
}

function ProfileDetails({ user }: { user: AppUser }) {
  const [state, action] = useActionState(updateProfileAction, {} as ActionState);

  return (
    <form action={action} className="stack">
      <FormAlert state={state} />

      <Field label="Name" name="name" state={state}>
        <input id="f-name" name="name" type="text" defaultValue={user.name} maxLength={120} required />
      </Field>

      <Field label="Email" name="email" hint="Contact your administrator to change your email.">
        <input id="f-email" name="email" type="email" defaultValue={user.email} disabled />
      </Field>

      <div className="fields2">
        <Field label="Role" name="role">
          <input id="f-role" name="role" type="text" defaultValue={user.role} disabled />
        </Field>

        <Field label="Phone" name="phone" state={state} hint="10-digit mobile number">
          <input id="f-phone" name="phone" type="tel" defaultValue={user.phone ?? ""} maxLength={15} />
        </Field>
      </div>

      <div className="formfoot">
        <SubmitButton>Save changes</SubmitButton>
      </div>
    </form>
  );
}

function BusinessInfo({ client }: { client: Client }) {
  return (
    <dl className="info">
      <dt>Business name</dt><dd>{client.name}</dd>
      <dt>Business type</dt><dd>{client.business_type ?? "—"}</dd>
      <dt>Email</dt><dd>{client.email}</dd>
      <dt>Phone</dt><dd>{client.phone ?? "—"}</dd>
      <dt>PAN</dt><dd>{client.pan ?? "—"}</dd>
      <dt>GSTIN</dt><dd>{client.gstin ?? "—"}</dd>
    </dl>
  );
}

export function ProfileForm({ user, client, firmName }: { user: AppUser; client?: Client | null; firmName: string }) {
  return (
    <div className="profile-page narrow">
      {/* Avatar + identity header */}
      <section className="panel profile-header">
        <AvatarSection user={user} />
        <div className="profile-identity">
          <h2 style={{ margin: 0 }}>{user.name}</h2>
          <span className="muted">{user.email}</span>
          <span className={`badge role-${user.role.toLowerCase()}`}>{user.role}</span>
        </div>
      </section>

      {/* Account details */}
      <section className="panel">
        <div className="panel-h"><h3>Account details</h3></div>
        <div className="panel-b padded">
          <ProfileDetails user={user} />
        </div>
      </section>

      {/* Business info — CLIENT only */}
      {client && (
        <section className="panel">
          <div className="panel-h"><h3>Business information</h3><span className="muted small">Contact your CA to update</span></div>
          <div className="panel-b padded">
            <BusinessInfo client={client} />
          </div>
        </section>
      )}

      {/* Firm */}
      <section className="panel">
        <div className="panel-h"><h3>Organisation</h3></div>
        <div className="panel-b padded">
          <dl className="info">
            <dt>Firm</dt><dd>{firmName}</dd>
          </dl>
        </div>
      </section>
    </div>
  );
}
