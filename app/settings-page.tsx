"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

type Locale = "cs" | "en";
type AppRole = "superadmin" | "boss" | "mechanic";

type ManagedUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  locale: Locale;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

type UserForm = {
  email: string;
  fullName: string;
  role: AppRole;
  locale: Locale;
  isActive: boolean;
};

const emptyForm: UserForm = {
  email: "",
  fullName: "",
  role: "mechanic",
  locale: "cs",
  isActive: true,
};

const roleOrder: AppRole[] = ["superadmin", "boss", "mechanic"];

const content = {
  cs: {
    title: "Přístupy a role",
    intro: "Řiďte, kdo se může přihlásit do MM SYSTEM a jaké má oprávnění.",
    add: "Přidat uživatele",
    activeUsers: "Aktivní uživatelé",
    superadmins: "Superadmini",
    protected: "Chráněný přístup",
    protectedNote: "Přihlášení přes ověřený účet",
    authTitle: "Přihlášení a hesla",
    authIntro: "Uživatelé se přihlašují svým ChatGPT účtem. MM SYSTEM hesla neukládá a superadmin je nemůže zobrazit ani měnit.",
    identityLabel: "Ověření identity",
    identityValue: "ChatGPT / OpenAI účet",
    passwordLabel: "Změna hesla",
    passwordValue: "Uživatel ve svém ChatGPT účtu",
    accessLabel: "Přístup do MM SYSTEM",
    accessValue: "Řídí superadmin v seznamu níže",
    rolesTitle: "Nastavení rolí",
    rolesIntro: "Výchozí rozsah můžete později upravit podle fungování týmu.",
    roleNames: { superadmin: "Superadmin", boss: "Vedení", mechanic: "Mechanik" },
    roleDescriptions: {
      superadmin: "Plný přístup, správa uživatelů, rolí a citlivých operací.",
      boss: "Provozní a finanční přehled, vytváření a úpravy firemních dat.",
      mechanic: "Provozní přístup bez financí, administrace a mazání záznamů.",
    },
    usersTitle: "Uživatelé systému",
    usersIntro: "Přístup získají pouze aktivní účty uvedené v tomto seznamu.",
    user: "Uživatel",
    role: "Role",
    language: "Jazyk",
    status: "Stav",
    actions: "Akce",
    active: "Aktivní",
    inactive: "Pozastavený",
    you: "Vy",
    edit: "Upravit",
    loading: "Načítám uživatele…",
    loadError: "Uživatele se nepodařilo načíst.",
    retry: "Zkusit znovu",
    addTitle: "Přidat uživatele",
    editTitle: "Upravit přístup",
    name: "Jméno a příjmení",
    email: "E-mail přihlašovacího účtu",
    accountStatus: "Přístup do systému",
    enabled: "Účet je aktivní",
    selfProtection: "Vlastní roli a přístup nelze odebrat, abyste se ze systému nezablokoval.",
    cancel: "Zrušit",
    save: "Uložit",
    saving: "Ukládám…",
    duplicate: "Uživatel s tímto e-mailem už existuje.",
    genericError: "Změnu se nepodařilo uložit.",
    forbidden: "Tuto část může spravovat pouze superadmin.",
  },
  en: {
    title: "Access and roles",
    intro: "Control who can sign in to MM SYSTEM and what they are allowed to do.",
    add: "Add user",
    activeUsers: "Active users",
    superadmins: "Superadmins",
    protected: "Protected access",
    protectedNote: "Verified account sign-in",
    authTitle: "Sign-in and passwords",
    authIntro: "Users sign in with their ChatGPT account. MM SYSTEM does not store passwords, and a superadmin cannot view or change them.",
    identityLabel: "Identity verification",
    identityValue: "ChatGPT / OpenAI account",
    passwordLabel: "Password changes",
    passwordValue: "The user in their ChatGPT account",
    accessLabel: "MM SYSTEM access",
    accessValue: "Controlled by a superadmin below",
    rolesTitle: "Role setup",
    rolesIntro: "The default scope can be refined later to match how the team works.",
    roleNames: { superadmin: "Superadmin", boss: "Management", mechanic: "Mechanic" },
    roleDescriptions: {
      superadmin: "Full access, user and role management, and sensitive operations.",
      boss: "Operational and financial overview, creating and editing company data.",
      mechanic: "Operational access without finance, administration, or record deletion.",
    },
    usersTitle: "System users",
    usersIntro: "Only active accounts listed here can access the system.",
    user: "User",
    role: "Role",
    language: "Language",
    status: "Status",
    actions: "Actions",
    active: "Active",
    inactive: "Suspended",
    you: "You",
    edit: "Edit",
    loading: "Loading users…",
    loadError: "Users could not be loaded.",
    retry: "Try again",
    addTitle: "Add user",
    editTitle: "Edit access",
    name: "Full name",
    email: "Sign-in account email",
    accountStatus: "System access",
    enabled: "Account is active",
    selfProtection: "Your own role and access cannot be removed, preventing an accidental lockout.",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    duplicate: "A user with this email already exists.",
    genericError: "The change could not be saved.",
    forbidden: "Only a superadmin can manage this section.",
  },
} as const;

export function SettingsPage({
  locale,
  role,
  sessionUserId,
  onCurrentUserUpdated,
}: {
  locale: Locale;
  role: AppRole;
  sessionUserId: string;
  onCurrentUserUpdated: (user: Pick<ManagedUser, "fullName" | "email" | "role" | "locale">) => void;
}) {
  const t = content[locale];
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(role === "superadmin");
  const [loadError, setLoadError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function loadUsers() {
    if (role !== "superadmin") return;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { users: ManagedUser[] };
      setUsers(data.users);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, [role]);

  const counts = useMemo(() => ({
    active: users.filter((user) => user.isActive).length,
    superadmins: users.filter((user) => user.isActive && user.role === "superadmin").length,
  }), [users]);

  function openNewUser() {
    setEditingUser(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  }

  function openEditUser(user: ManagedUser) {
    setEditingUser(user);
    setForm({
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      locale: user.locale,
      isActive: user.isActive,
    });
    setFormError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingUser(null);
    setFormError("");
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch("/api/users", {
        method: editingUser ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editingUser ? { ...form, id: editingUser.id } : form),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        if (response.status === 409) throw new Error("duplicate");
        throw new Error(payload?.error || "save failed");
      }
      const data = (await response.json()) as { user: ManagedUser };
      setUsers((current) => {
        const exists = current.some((user) => user.id === data.user.id);
        const next = exists
          ? current.map((user) => user.id === data.user.id ? data.user : user)
          : [...current, data.user];
        return next.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.fullName.localeCompare(b.fullName));
      });
      if (data.user.id === sessionUserId) onCurrentUserUpdated(data.user);
      setModalOpen(false);
      setEditingUser(null);
    } catch (error) {
      setFormError(error instanceof Error && error.message === "duplicate" ? t.duplicate : t.genericError);
    } finally {
      setSaving(false);
    }
  }

  if (role !== "superadmin") {
    return (
      <section className="panel settings-forbidden">
        <span aria-hidden="true">🔒</span>
        <h2>{t.title}</h2>
        <p>{t.forbidden}</p>
      </section>
    );
  }

  return (
    <section className="settings-page">
      <article className="panel settings-hero">
        <div>
          <span className="settings-kicker">MM SYSTEM · SECURITY</span>
          <h2>{t.title}</h2>
          <p>{t.intro}</p>
        </div>
        <button className="primary-button" type="button" onClick={openNewUser}>＋ {t.add}</button>
      </article>

      <div className="settings-stat-grid">
        <article className="panel settings-stat">
          <span className="settings-stat-icon green" aria-hidden="true">●</span>
          <div><small>{t.activeUsers}</small><strong>{counts.active}</strong></div>
        </article>
        <article className="panel settings-stat">
          <span className="settings-stat-icon red" aria-hidden="true">◆</span>
          <div><small>{t.superadmins}</small><strong>{counts.superadmins}</strong></div>
        </article>
        <article className="panel settings-stat settings-stat-wide">
          <span className="settings-stat-icon dark" aria-hidden="true">✓</span>
          <div><small>{t.protected}</small><strong>{t.protectedNote}</strong></div>
        </article>
      </div>

      <article className="panel settings-auth-policy">
        <span className="settings-auth-lock" aria-hidden="true">🔐</span>
        <div className="settings-auth-copy"><h3>{t.authTitle}</h3><p>{t.authIntro}</p></div>
        <dl>
          <div><dt>{t.identityLabel}</dt><dd>{t.identityValue}</dd></div>
          <div><dt>{t.passwordLabel}</dt><dd>{t.passwordValue}</dd></div>
          <div><dt>{t.accessLabel}</dt><dd>{t.accessValue}</dd></div>
        </dl>
      </article>

      <article className="panel settings-roles">
        <header className="settings-section-heading">
          <div><h3>{t.rolesTitle}</h3><p>{t.rolesIntro}</p></div>
        </header>
        <div className="role-card-grid">
          {roleOrder.map((item) => (
            <div className={`role-card role-${item}`} key={item}>
              <span className="role-card-mark" aria-hidden="true">{item === "superadmin" ? "◆" : item === "boss" ? "◈" : "●"}</span>
              <div><strong>{t.roleNames[item]}</strong><p>{t.roleDescriptions[item]}</p></div>
            </div>
          ))}
        </div>
      </article>

      <article className="panel settings-users">
        <header className="settings-section-heading">
          <div><h3>{t.usersTitle}</h3><p>{t.usersIntro}</p></div>
        </header>

        {loading && <div className="settings-message"><span className="spinner" />{t.loading}</div>}
        {!loading && loadError && (
          <div className="settings-message settings-error">
            <span>{t.loadError}</span>
            <button className="secondary-compact" type="button" onClick={() => void loadUsers()}>{t.retry}</button>
          </div>
        )}
        {!loading && !loadError && (
          <div className="table-wrap settings-table-wrap">
            <table className="settings-table">
              <thead><tr><th>{t.user}</th><th>{t.role}</th><th>{t.language}</th><th>{t.status}</th><th className="action-column">{t.actions}</th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="settings-user-cell">
                        <span className="settings-user-avatar">{initials(user.fullName)}</span>
                        <span><strong>{user.fullName} {user.id === sessionUserId && <em>{t.you}</em>}</strong><small>{user.email}</small></span>
                      </div>
                    </td>
                    <td><span className={`role-pill role-${user.role}`}>{t.roleNames[user.role]}</span></td>
                    <td>{user.locale === "cs" ? "Čeština" : "English"}</td>
                    <td><span className={`status-pill ${user.isActive ? "success" : "neutral"}`}>{user.isActive ? t.active : t.inactive}</span></td>
                    <td className="action-column"><button className="table-action" type="button" onClick={() => openEditUser(user)}>{t.edit}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          <form className="modal settings-user-modal" onSubmit={saveUser}>
            <header className="modal-header">
              <div><span className="settings-kicker">MM SYSTEM · ACCESS</span><h2>{editingUser ? t.editTitle : t.addTitle}</h2></div>
              <button className="modal-close" type="button" onClick={closeModal} aria-label={t.cancel}>×</button>
            </header>
            <div className="form-grid">
              <label>{t.name}<input required minLength={2} maxLength={120} value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} /></label>
              <label>{t.email}<input required type="email" maxLength={254} disabled={Boolean(editingUser)} value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label>{t.role}<select value={form.role} disabled={editingUser?.id === sessionUserId} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as AppRole }))}>{roleOrder.map((item) => <option value={item} key={item}>{t.roleNames[item]}</option>)}</select></label>
              <label>{t.language}<select value={form.locale} onChange={(event) => setForm((current) => ({ ...current, locale: event.target.value as Locale }))}><option value="cs">Čeština</option><option value="en">English</option></select></label>
              <label className="settings-active-field">
                <span>{t.accountStatus}</span>
                <span className="settings-check"><input type="checkbox" checked={form.isActive} disabled={editingUser?.id === sessionUserId} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />{t.enabled}</span>
              </label>
            </div>
            {editingUser?.id === sessionUserId && <p className="settings-self-note">🔒 {t.selfProtection}</p>}
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <footer className="modal-actions">
              <button className="secondary-compact" type="button" onClick={closeModal}>{t.cancel}</button>
              <button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : t.save}</button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "U") + (parts.length > 1 ? parts.at(-1)?.[0] || "" : "");
}
