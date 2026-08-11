"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import type {
  AdminTeamDirectoryFilters,
  AdminTeamDirectoryRow,
} from "@/admin/teams";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { Badge, BadgeDot } from "@/components/ui/base-badge";
import { METRIC_CARD_TONES, metricCardStyle } from "@/components/ui/statistics-card";
import { roleLabel, statusLabel } from "@/presentation/labels";
import styles from "./teams-admin.module.css";

type SerializedTeamRow = Omit<AdminTeamDirectoryRow, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

type TeamDetails = {
  team: {
    id: string;
    name: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
  };
  members: Array<{
    membershipId: string;
    profileId: string;
    name: string;
    email: string | null;
    role: "agent" | "manager" | "admin";
    membershipRole: "agent" | "manager";
    accountStatus: string;
    startedAt: string;
  }>;
  managers: TeamDetails["members"];
  counts: { members: number; agents: number; activeAgents: number; managers: number };
  memberPagination: { page: number; pageSize: number; totalRows: number; totalPages: number; query: string };
  destinationTeams: Array<{ id: string; name: string }>;
  assignableManagers: Array<{ id: string; name: string; email: string | null }>;
  activity: Array<{ id: string; event: string; actorName: string; createdAt: string }>;
  performance: {
    range: { from: string; to: string; label: string };
    sources: { dialer: string; transfers: string; closedDeals: string; message: string | null };
    metrics: null | {
      transfers: number | null;
      closedDeals: number | null;
      conversion: number | null;
      averageLoggedInSeconds: number | null;
      averageTalkPercentage: number | null;
      comparison: null | {
        transfers: number | null;
        closedDeals: number | null;
        conversion: number | null;
        averageLoggedInSeconds: number | null;
        averageTalkPercentage: number | null;
      };
    };
  };
};

type Highlight = "all" | "active" | "inactive" | "agents" | "managers" | "members";
type DrawerTab = "overview" | "members" | "settings" | "activity";

export function AdminTeamsWorkspace({
  directory,
  filters,
  stats,
}: {
  directory: {
    rows: SerializedTeamRow[];
    managerOptions: Array<{ id: string; name: string }>;
    pagination: { page: number; pageSize: number; totalRows: number; totalPages: number; from: number; to: number };
  };
  filters: AdminTeamDirectoryFilters;
  stats: { totalTeams: number; activeTeams: number; inactiveTeams: number; totalMembers: number; activeAgents: number; teamManagers: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const drawer = useRef<HTMLDialogElement>(null);
  const statusDialog = useRef<HTMLDialogElement>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const [highlight, setHighlight] = useState<Highlight>("all");
  const [previewHighlight, setPreviewHighlight] = useState<Highlight | null>(null);
  const [query, setQuery] = useState(filters.query);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [details, setDetails] = useState<TeamDetails | null>(null);
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [pendingStatus, setPendingStatus] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const effectiveHighlight = previewHighlight ?? highlight;

  const exportParams = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    return params.toString();
  }, [searchParams]);

  function navigate(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!("page" in patch)) params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function createTeam(formData: FormData) {
    setBusy("create");
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formData.get("name") }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Team creation failed.");
      setFeedback({ tone: "success", message: "The team was created and is available for active assignments." });
      router.refresh();
    } catch (cause) {
      setFeedback({ tone: "error", message: cause instanceof Error ? cause.message : "Team creation failed." });
    } finally {
      setBusy(null);
    }
  }

  async function loadTeamDetails(teamId: string, nextMemberQuery = "", memberPage = 1) {
    const params = new URLSearchParams({ memberQuery: nextMemberQuery, memberPage: String(memberPage), memberPageSize: "25" });
    const response = await fetch(`/api/admin/teams/${teamId}?${params}`, { cache: "no-store" });
    const payload = (await response.json()) as TeamDetails & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Team details could not be loaded.");
    setDetails(payload);
    setMemberQuery(payload.memberPagination.query);
  }

  async function openTeam(teamId: string, trigger: HTMLButtonElement, nextTab: DrawerTab = "overview") {
    lastTrigger.current = trigger;
    setSelectedTeamId(teamId);
    setDetails(null);
    setTab(nextTab);
    setFeedback(null);
    drawer.current?.showModal();
    setBusy("load");
    try {
      await loadTeamDetails(teamId);
    } catch (cause) {
      setFeedback({ tone: "error", message: cause instanceof Error ? cause.message : "Team details could not be loaded." });
    } finally {
      setBusy(null);
    }
  }

  async function mutateTeam(body: Record<string, unknown>, success: string) {
    if (!selectedTeamId) return false;
    setBusy(String(body.action));
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/teams/${selectedTeamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Team update failed.");
      setFeedback({ tone: "success", message: success });
      await loadTeamDetails(selectedTeamId, memberQuery, details?.memberPagination.page ?? 1);
      router.refresh();
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Team update failed.";
      setFeedback({ tone: "error", message });
      if (body.action === "status") setStatusError(message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  function requestStatus(active: boolean) {
    setPendingStatus(active);
    setStatusError(null);
    statusDialog.current?.showModal();
  }

  async function loadMemberPage(nextQuery: string, page: number) {
    if (!selectedTeamId) return;
    setBusy("members");
    setFeedback(null);
    try {
      await loadTeamDetails(selectedTeamId, nextQuery, page);
    } catch (cause) {
      setFeedback({ tone: "error", message: cause instanceof Error ? cause.message : "Team members could not be loaded." });
    } finally {
      setBusy(null);
    }
  }

  return <>
    {feedback ? <div className={feedback.tone === "error" ? styles.feedbackError : styles.feedbackSuccess} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.message}</div> : null}

    <section aria-label="Team summary" className={styles.kpis}>
      <Kpi active={highlight === "all"} detail={`${stats.activeTeams} active · ${stats.inactiveTeams} inactive`} icon="audit" label="Total teams" meta={`${stats.activeTeams} active teams`} onActivate={() => setHighlight("all")} onPreview={setPreviewHighlight} preview="all" value={stats.totalTeams} />
      <Kpi active={highlight === "members"} detail={`${stats.totalMembers} current active memberships across all non-archived teams`} icon="users" label="Total members" meta="Across all teams" onActivate={() => setHighlight("members")} onPreview={setPreviewHighlight} preview="members" value={stats.totalMembers} />
      <Kpi active={highlight === "agents"} detail={`${stats.activeAgents} active agents with a current valid membership on an active team`} icon="agent" label="Active agents" meta={stats.totalMembers ? `${((stats.activeAgents / stats.totalMembers) * 100).toFixed(1)}% of memberships` : "No current memberships"} onActivate={() => setHighlight("agents")} onPreview={setPreviewHighlight} preview="agents" value={stats.activeAgents} />
      <Kpi active={highlight === "managers"} detail={`${stats.teamManagers} unique managers with a current team membership`} icon="teams" label="Team managers" meta="Unique current managers" onActivate={() => setHighlight("managers")} onPreview={setPreviewHighlight} preview="managers" value={stats.teamManagers} />
      <Kpi active={highlight === "inactive"} detail={`${stats.inactiveTeams} inactive · ${stats.activeTeams} active`} icon="pause" label="Inactive teams" meta={stats.totalTeams ? `${((stats.inactiveTeams / stats.totalTeams) * 100).toFixed(1)}% of teams` : "No teams"} onActivate={() => setHighlight("inactive")} onPreview={setPreviewHighlight} preview="inactive" value={stats.inactiveTeams} />
    </section>

    <section className={styles.createCard}>
      <div><h2>Create a team</h2><p>Add a new reporting team to organize managers and agents.</p></div>
      <form action={createTeam}>
        <label>Team name<input aria-describedby="team-name-help" autoComplete="off" name="name" placeholder="Enter team name" required /></label>
        <span className={styles.srOnly} id="team-name-help">Names are normalized and must be unique within your organization.</span>
        <button className={styles.button} disabled={busy === "create"}>{busy === "create" ? "Creating team…" : "Create team"}</button>
      </form>
    </section>

    <section className={styles.directory}>
      <header className={styles.directoryHeader}>
        <div><h2>Teams <span>{directory.pagination.totalRows}</span></h2><p>Search, inspect, and manage current reporting teams.</p></div>
        <Link className={styles.buttonSecondary} download href={`/api/admin/teams/export${exportParams ? `?${exportParams}` : ""}`}><DashboardIcon name="import" /> Export</Link>
      </header>
      <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); navigate({ q: query || null }); }} role="search">
        <label><span>Search teams</span><span className={styles.searchField}><DashboardIcon name="search" /><input onChange={(event) => setQuery(event.target.value)} placeholder="Search teams…" type="search" value={query} /></span></label>
        <label><span>Status</span><select onChange={(event) => navigate({ status: event.target.value || null })} value={filters.status}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label><span>Team manager</span><select onChange={(event) => navigate({ manager: event.target.value || null })} value={filters.managerId}><option value="">All managers</option>{directory.managerOptions.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label>
        <button className={styles.buttonSecondary} type="submit">Search</button>
        <button className={styles.buttonGhost} onClick={() => { setQuery(""); router.replace(pathname, { scroll: false }); }} type="button">Clear filters</button>
      </form>
      <div aria-label="Teams directory" className={styles.tableWrap} tabIndex={0}>
        <table>
          <caption>Authorized team directory with current membership totals</caption>
          <thead><tr><SortableHeader direction={filters.direction} filters={filters} label="Team name" navigate={navigate} value="name" /><th scope="col">Team manager</th><SortableHeader direction={filters.direction} filters={filters} label="Members" navigate={navigate} value="members" /><SortableHeader direction={filters.direction} filters={filters} label="Agents" navigate={navigate} value="agents" /><SortableHeader direction={filters.direction} filters={filters} label="Status" navigate={navigate} value="status" /><SortableHeader direction={filters.direction} filters={filters} label="Created" navigate={navigate} value="created" /><th scope="col">Actions</th></tr></thead>
          <tbody>{directory.rows.length ? directory.rows.map((team) => {
            const dimmed = (effectiveHighlight === "active" && !team.active) || (effectiveHighlight === "inactive" && team.active) || (effectiveHighlight === "agents" && team.activeAgentCount === 0) || (effectiveHighlight === "managers" && team.managerCount === 0) || (effectiveHighlight === "members" && team.memberCount === 0);
            return <tr data-dimmed={dimmed || undefined} data-selected={selectedTeamId === team.id || undefined} key={team.id}>
              <th scope="row"><span className={styles.teamIdentity}><span className={styles.teamMark}>{initials(team.name)}</span><button onClick={(event) => openTeam(team.id, event.currentTarget)} type="button">{team.name}</button></span></th>
              <td><ManagerSummary managers={team.managers} /></td>
              <td className={styles.numeric}>{team.memberCount}</td>
              <td className={styles.numeric}>{team.agentCount}</td>
              <td><details className={styles.statusDetails}><Badge appearance="light" render={<summary />} shape="circle" size="xs" variant={team.active ? "success" : "destructive"}><BadgeDot />{team.active ? "Active" : "Inactive"}</Badge><p>{team.active ? "Available for active assignments." : "Unavailable for new assignments. Historical reporting remains."}</p></details></td>
              <td><time dateTime={team.createdAt}>{formatDate(team.createdAt)}</time></td>
              <td><div className={styles.rowActions}><button aria-label={`View ${team.name}`} onClick={(event) => openTeam(team.id, event.currentTarget)} type="button"><DashboardIcon name="info" /></button><button aria-label={`Manage members for ${team.name}`} onClick={(event) => openTeam(team.id, event.currentTarget, "members")} type="button"><DashboardIcon name="users" /></button></div></td>
            </tr>;
          }) : <tr><td colSpan={7}><Empty title={filters.query || filters.status || filters.managerId ? "No teams match these filters" : "No teams yet"} detail={filters.query || filters.status || filters.managerId ? "Change or clear the directory filters." : "Create the first reporting team to begin assigning members."} /></td></tr>}</tbody>
        </table>
      </div>
      <footer className={styles.pagination}><span>Showing {directory.pagination.from}–{directory.pagination.to} of {directory.pagination.totalRows} teams</span><nav aria-label="Teams pages"><button disabled={directory.pagination.page <= 1} onClick={() => navigate({ page: String(directory.pagination.page - 1) })} type="button">‹</button>{pageNumbers(directory.pagination.page, directory.pagination.totalPages).map((page) => <button aria-current={page === directory.pagination.page ? "page" : undefined} key={page} onClick={() => navigate({ page: String(page) })} type="button">{page}</button>)}<button disabled={directory.pagination.page >= directory.pagination.totalPages} onClick={() => navigate({ page: String(directory.pagination.page + 1) })} type="button">›</button></nav><label>Rows per page<select onChange={(event) => navigate({ pageSize: event.target.value, page: "1" })} value={filters.pageSize}>{[10, 25, 50].map((size) => <option key={size}>{size}</option>)}</select></label></footer>
    </section>

    <dialog aria-labelledby="team-drawer-title" className={styles.drawer} onClose={() => { setSelectedTeamId(null); setDetails(null); lastTrigger.current?.focus(); }} ref={drawer}>
      <div className={styles.drawerInner}>
        <header className={styles.drawerHeader}><strong id="team-drawer-title">Team details</strong><button aria-label="Close team details" onClick={() => drawer.current?.close()} type="button"><DashboardIcon name="close" /></button></header>
        {busy === "load" ? <p className={styles.drawerLoading}>Loading authorized team details…</p> : !details ? <p className={styles.drawerLoading}>{feedback?.message ?? "Team details are unavailable."}</p> : <>
          <div className={styles.drawerTeam}><span className={styles.drawerMark}>{initials(details.team.name)}</span><div><h2>{details.team.name}</h2><Badge appearance="light" shape="circle" size="xs" variant={details.team.active ? "success" : "destructive"}><BadgeDot />{details.team.active ? "Active" : "Inactive"}</Badge><p>{managerNames(details.managers)}</p></div></div>
          <nav aria-label="Team detail sections" className={styles.tabs}>{(["overview", "members", "settings", "activity"] as DrawerTab[]).map((item) => <button aria-current={tab === item ? "page" : undefined} key={item} onClick={() => setTab(item)} type="button">{item === "members" ? `Members (${details.counts.members})` : capitalize(item)}</button>)}</nav>
          <div className={styles.drawerBody}>
            {feedback ? <div className={feedback.tone === "error" ? styles.feedbackError : styles.feedbackSuccess} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.message}</div> : null}
            {tab === "overview" ? <Overview details={details} onTab={setTab} onStatus={requestStatus} /> : null}
            {tab === "members" ? <Members details={details} loadPage={loadMemberPage} memberQuery={memberQuery} mutate={mutateTeam} setMemberQuery={setMemberQuery} /> : null}
            {tab === "settings" ? <Settings busy={busy} details={details} mutate={mutateTeam} onStatus={requestStatus} /> : null}
            {tab === "activity" ? <Activity details={details} /> : null}
            <Performance details={details} />
          </div>
        </>}
      </div>
    </dialog>

    <dialog aria-describedby="team-status-description" aria-labelledby="team-status-title" className={styles.confirmDialog} ref={statusDialog}>
      <form method="dialog"><h2 id="team-status-title">{pendingStatus ? "Reactivate this team?" : "Deactivate this team?"}</h2><p id="team-status-description">{pendingStatus ? "The team will become available for new assignments. Historical memberships are not restored automatically." : "The team will become unavailable for new assignments. Active memberships must be resolved first and historical performance remains intact."}</p>{statusError ? <p className={styles.feedbackError} role="alert">{statusError}</p> : null}<div><button className={styles.buttonSecondary} disabled={busy === "status"} value="cancel">Cancel</button><button className={pendingStatus ? styles.button : styles.buttonDanger} disabled={busy === "status"} onClick={async (event) => { event.preventDefault(); const changed = await mutateTeam({ action: "status", active: pendingStatus }, pendingStatus ? "The team was reactivated." : "The team was deactivated."); if (changed) statusDialog.current?.close(); }}>{busy === "status" ? "Updating…" : pendingStatus ? "Reactivate team" : "Deactivate team"}</button></div></form>
    </dialog>
  </>;
}

function Kpi({ active, detail, icon, label, meta, onActivate, onPreview, preview, value }: { active: boolean; detail: string; icon: "audit" | "users" | "agent" | "teams" | "pause"; label: string; meta: string; onActivate: () => void; onPreview: (value: Highlight | null) => void; preview: Highlight; value: number }) {
  const tone = icon === "users" ? METRIC_CARD_TONES.green : icon === "agent" ? METRIC_CARD_TONES.cyan : icon === "teams" ? METRIC_CARD_TONES.purple : icon === "pause" ? METRIC_CARD_TONES.orange : METRIC_CARD_TONES.blue;
  return <button aria-pressed={active} className={`${styles.kpi} metric-color-card`} onBlur={() => onPreview(null)} onClick={onActivate} onFocus={() => onPreview(preview)} onPointerEnter={() => onPreview(preview)} onPointerLeave={() => onPreview(null)} style={metricCardStyle(tone)} type="button"><span className={`${styles.kpiLabel} metric-card-label`}>{label}</span><strong className="metric-card-value">{value}</strong><span className={`${styles.kpiMeta} metric-card-detail`}>{meta}</span><span className={`${styles.kpiIcon} metric-card-icon`}><DashboardIcon name={icon} /></span><span className={styles.kpiDetail} role="tooltip">{detail}</span></button>;
}

function SortableHeader({ direction, filters, label, navigate, value }: { direction: string; filters: AdminTeamDirectoryFilters; label: string; navigate: (patch: Record<string, string | null>) => void; value: AdminTeamDirectoryFilters["sortBy"] }) {
  const selected = filters.sortBy === value;
  return <th scope="col"><button aria-label={`Sort by ${label}`} onClick={() => navigate({ sort: value, direction: selected && direction === "asc" ? "desc" : "asc" })} type="button">{label} {selected ? direction === "asc" ? "↑" : "↓" : ""}</button></th>;
}

function ManagerSummary({ managers }: { managers: SerializedTeamRow["managers"] }) {
  if (!managers.length) return <span className={styles.muted}>No manager assigned</span>;
  const lead = managers[0]!;
  return <span className={styles.manager}><span className={styles.avatar}>{initials(lead.name)}</span><span><strong>{lead.name}</strong>{managers.length > 1 ? <small>+{managers.length - 1} more manager(s)</small> : <small>{statusLabel(lead.accountStatus)}</small>}</span></span>;
}

function Overview({ details, onStatus, onTab }: { details: TeamDetails; onStatus: (active: boolean) => void; onTab: (tab: DrawerTab) => void }) {
  const ratio = details.counts.members ? (details.counts.activeAgents / details.counts.members) * 100 : 0;
  return <section className={styles.drawerSection}><dl className={styles.facts}><dt>Team name</dt><dd>{details.team.name}</dd><dt>Team manager</dt><dd>{managerNames(details.managers)}</dd><dt>Created</dt><dd>{formatDate(details.team.createdAt)}</dd><dt>Total members</dt><dd>{details.counts.members}</dd><dt>Agents</dt><dd>{details.counts.agents}</dd><dt>Status</dt><dd>{details.team.active ? "Active" : "Inactive"}</dd></dl><button aria-label={`${details.counts.activeAgents} active agents of ${details.counts.members} current members, ${ratio.toFixed(1)} percent`} className={styles.progress} type="button"><span><strong>Active agents</strong><b>{details.counts.activeAgents} of {details.counts.members} ({ratio.toFixed(1)}%)</b></span><i><b style={{ width: `${Math.min(100, ratio)}%` }} /></i><em role="tooltip">Active accounts with a current Agent membership on this team.</em></button><div className={styles.quickActions}><h3>Quick actions</h3><button className={styles.buttonSecondary} onClick={() => onTab("settings")} type="button">Edit team</button><button className={styles.buttonSecondary} onClick={() => onTab("members")} type="button">Manage members</button>{details.team.active ? details.counts.members === 0 ? <button className={styles.buttonDanger} onClick={() => onStatus(false)} type="button">Deactivate team</button> : <p className={styles.blocked}>Move or remove {details.counts.managers} manager(s) and {details.counts.agents} agent(s) before deactivation.</p> : <button className={styles.buttonSecondary} onClick={() => onStatus(true)} type="button">Reactivate team</button>}</div></section>;
}

function Members({ details, loadPage, memberQuery, mutate, setMemberQuery }: { details: TeamDetails; loadPage: (query: string, page: number) => Promise<void>; memberQuery: string; mutate: (body: Record<string, unknown>, success: string) => Promise<boolean>; setMemberQuery: (value: string) => void }) {
  const pagination = details.memberPagination;
  return <section className={styles.drawerSection}>
    <form className={styles.memberSearch} onSubmit={(event) => { event.preventDefault(); void loadPage(memberQuery, 1); }} role="search">
      <DashboardIcon name="search" /><label className={styles.srOnly} htmlFor="team-member-search">Search members</label><input id="team-member-search" onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search members…" type="search" value={memberQuery} /><button className={styles.buttonSecondary}>Search</button>
    </form>
    <div className={styles.memberList}>{details.members.length ? details.members.map((member) => <article key={member.membershipId}><header><span className={styles.avatar}>{initials(member.name)}</span><div><strong>{member.name}</strong><small>{roleLabel(member.role)} · {statusLabel(member.accountStatus)}</small></div></header><dl><dt>Membership started</dt><dd>{formatDate(member.startedAt)}</dd><dt>Current team</dt><dd>{details.team.name}</dd></dl><MemberAssignment details={details} member={member} mutate={mutate} /><button className={styles.buttonDanger} onClick={() => { if (window.confirm(`Remove ${member.name}'s current team assignment? Membership history will be preserved.`)) void mutate({ action: "remove-member", membershipId: member.membershipId }, `${member.name}'s active team assignment was removed.`); }} type="button">Remove assignment</button></article>) : <Empty title={pagination.query ? "No members match this search" : "No current team members"} detail={pagination.query ? "Change or clear the member search." : "Assign an active manager or agent from Users & Access or another team."} />}</div>
    <footer className={styles.memberPagination}><span>{pagination.totalRows} matching member(s)</span><div><button className={styles.buttonSecondary} disabled={pagination.page <= 1} onClick={() => void loadPage(pagination.query, pagination.page - 1)} type="button">Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button className={styles.buttonSecondary} disabled={pagination.page >= pagination.totalPages} onClick={() => void loadPage(pagination.query, pagination.page + 1)} type="button">Next</button></div></footer>
  </section>;
}

function MemberAssignment({ details, member, mutate }: { details: TeamDetails; member: TeamDetails["members"][number]; mutate: (body: Record<string, unknown>, success: string) => Promise<boolean> }) {
  const [value, setValue] = useState(details.team.id);
  const [pending, setPending] = useState(false);
  return <label>Move to team<select disabled={pending} onChange={async (event) => { const teamId = event.target.value; setValue(teamId); if (teamId === details.team.id) return; setPending(true); const changed = await mutate({ action: "move-member", userId: member.profileId, targetTeamId: teamId }, `${member.name} was moved to ${details.destinationTeams.find((team) => team.id === teamId)?.name ?? "the selected team"}.`); if (!changed) setValue(details.team.id); setPending(false); }} value={value}><option value={details.team.id}>{details.team.name}</option>{details.destinationTeams.filter((team) => team.id !== details.team.id).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>;
}

function Settings({ busy, details, mutate, onStatus }: { busy: string | null; details: TeamDetails; mutate: (body: Record<string, unknown>, success: string) => Promise<boolean>; onStatus: (active: boolean) => void }) {
  return <section className={styles.drawerSection}><form action={(formData) => void mutate({ action: "rename", name: formData.get("name") }, "The team was renamed.")} className={styles.settingsForm}><label>Team name<input defaultValue={details.team.name} name="name" required /></label><button className={styles.button} disabled={busy === "rename"}>{busy === "rename" ? "Saving…" : "Save team name"}</button></form><form action={(formData) => void mutate({ action: "assign-manager", managerId: formData.get("managerId") }, "The team manager assignment was updated.")} className={styles.settingsForm}><label>Team manager<select defaultValue={details.managers[0]?.profileId ?? ""} name="managerId" required><option value="">Select active manager</option>{details.assignableManagers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label><p>Manager assignment is stored as the current membership and preserves prior membership history.</p><button className={styles.buttonSecondary} disabled={busy === "assign-manager"}>{busy === "assign-manager" ? "Assigning…" : "Assign manager"}</button></form><div className={styles.lifecycle}><h3>Team lifecycle</h3>{details.team.active ? details.counts.members ? <p className={styles.blocked}>Deactivation is blocked while {details.counts.members} current membership(s) remain.</p> : <button className={styles.buttonDanger} onClick={() => onStatus(false)} type="button">Deactivate team</button> : <button className={styles.button} onClick={() => onStatus(true)} type="button">Reactivate team</button>}</div></section>;
}

function Activity({ details }: { details: TeamDetails }) {
  return <section className={styles.drawerSection}>{details.activity.length ? <ol className={styles.activity}>{details.activity.map((event) => <li key={event.id}><strong>{event.event}</strong><span>{event.actorName}</span><time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time></li>)}</ol> : <Empty title="No team activity recorded yet" detail="Team creation, edits, membership changes, and lifecycle events will appear here when recorded." />}</section>;
}

function Performance({ details }: { details: TeamDetails }) {
  const metrics = details.performance.metrics;
  return <section className={styles.performance}><header><div><h3>Team performance (last 7 days)</h3><p>{details.performance.range.from} – {details.performance.range.to}</p></div></header>{metrics ? <div className={styles.performanceGrid}><Metric label="Transfers" value={formatNumber(metrics.transfers)} /><Metric label="Closed deals" value={formatNumber(metrics.closedDeals)} /><Metric label="Conversion" value={formatPercent(metrics.conversion)} /><Metric label="Avg logged-in" value={formatDuration(metrics.averageLoggedInSeconds)} /></div> : <Empty title="Performance unavailable" detail={details.performance.sources.message ?? "No authorized Team Performance row is available for this team and period."} />}<Link className={styles.buttonSecondary} href={`/teams/performance?range=custom&from=${details.performance.range.from}&to=${details.performance.range.to}&teamId=${details.team.id}`}>View full team performance</Link></section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  const tone = label === "Closed deals"
    ? METRIC_CARD_TONES.green
    : label === "Conversion"
      ? METRIC_CARD_TONES.purple
      : label === "Avg logged-in"
        ? METRIC_CARD_TONES.orange
        : METRIC_CARD_TONES.blue;
  return <button className={`${styles.metric} metric-color-card`} style={metricCardStyle(tone)} type="button"><span className="metric-card-label">{label}</span><strong className="metric-card-value">{value}</strong><em role="tooltip">Exact value for the selected team over the last seven calendar days.</em></button>;
}
function Empty({ detail, title }: { detail: string; title: string }) { return <div className={styles.empty}><strong>{title}</strong><p>{detail}</p></div>; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "T"; }
function managerNames(managers: TeamDetails["managers"]) { return managers.length ? managers.map((manager) => manager.name).join(", ") : "No manager assigned"; }
function capitalize(value: string) { return value[0]?.toUpperCase() + value.slice(1); }
function formatDate(value: string) { return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); }
function formatNumber(value: number | null) { return value === null ? "Unavailable" : value.toLocaleString("en-US"); }
function formatPercent(value: number | null) { return value === null ? "Unavailable" : `${value.toFixed(1)}%`; }
function formatDuration(value: number | null) { if (value === null) return "Unavailable"; const hours = Math.floor(value / 3600); const minutes = Math.floor((value % 3600) / 60); return `${hours}h ${minutes}m`; }
function pageNumbers(current: number, total: number) { const values = new Set([1, total, current - 1, current, current + 1]); return [...values].filter((value) => value >= 1 && value <= total).sort((a, b) => a - b); }
