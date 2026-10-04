"use client";

import { useState } from "react";

import { PEOPLE, personById } from "@/lib/design-proof/product-fixtures";
import { DEFAULT_TEAM, addPerson, membersOf, seatTotals, startingSeats, type Seats } from "@/lib/design-proof/team-model";

import { ConversationScreen } from "./conversation";
import { Dashboard } from "./dashboard";
import { DASHBOARDS, type CtxId } from "@/lib/design-proof/dashboard-model";
import { LivingCv } from "./living-cv";
import { PeopleSearch } from "./search";
import { ProfileScreen } from "./profile-screen";
import { ProjectScreen } from "./project-screen";
import { AppShell, type NavId } from "./shell";
import { MarketScreen, TodayScreen } from "./today-market";
import { TeamFormation } from "./team-formation";
import { Btn, Segmented } from "./ui";

/**
 * THE PRODUCT PROOF — one internal product, several screens, one family.
 *
 *   shell · people search · person profile · Living CV (four densities) ·
 *   team formation · project with the formed team · conversation in project
 *   context · today · market
 *
 * State is shared the way it is in the product: the team formed in Team
 * formation is the team the Project and the Conversation show.
 */
export type ProofScreen = "dashboard" | "today" | "people" | "profile" | "cv" | "team" | "project" | "chat" | "market";

const NAV_OF: Record<ProofScreen, NavId> = {
  dashboard: "home",
  today: "home",
  people: "people",
  profile: "people",
  cv: "people",
  team: "teams",
  project: "projects",
  chat: "messages",
  market: "market",
};

const CV_PEOPLE = [
  { id: "do", label: "New person" },
  { id: "tk", label: "Experienced specialist" },
  { id: "lf", label: "Multi-skilled" },
  { id: "is", label: "Team lead" },
] as const;

export function ProductProof({
  initial = "team",
  initialTeam = "start",
  cv = "tk",
  profile = "is",
  chatOpen = false,
  dash = "active",
}: {
  readonly dash?: CtxId;
  readonly initial?: ProofScreen;
  readonly initialTeam?: "start" | "full";
  readonly cv?: string;
  readonly profile?: string;
  readonly chatOpen?: boolean;
}) {
  const [screen, setScreen] = useState<ProofScreen>(initial);
  const [seats, setSeats] = useState<Seats>(initialTeam === "full" ? DEFAULT_TEAM : startingSeats());
  const [confirmed, setConfirmed] = useState(initialTeam === "full");
  const [selected, setSelected] = useState<string | null>("is");
  const [profileId, setProfileId] = useState(profile);
  const [cvId, setCvId] = useState<string>(cv);
  const [dashCtx, setDashCtx] = useState<CtxId>(dash);

  const openProfile = (id: string) => {
    setProfileId(id);
    setScreen("profile");
  };
  const nav = (n: NavId) =>
    setScreen(n === "home" ? "dashboard" : n === "people" ? "people" : n === "teams" ? "team" : n === "projects" ? "project" : n === "market" ? "market" : "chat");
  const totals = seatTotals(seats);
  const teamIds = membersOf(seats).map((m) => m.personId);
  const projectSeats = totals.open === 0 && totals.invited === 0 ? seats : DEFAULT_TEAM;
  const addToTeam = (id: string) => {
    const r = addPerson(seats, id);
    if (r.result === "added") setSeats(r.seats);
  };

  return (
    <>
    {/* the global body rule is overflow-x:hidden, which makes <body> a scroll container and silently disables position:sticky; clip does not */}
    <style>{"html,body{overflow-x:clip !important}"}</style>
    <AppShell active={NAV_OF[screen]} onNav={nav} onOpenPerson={openProfile} acting={screen === "dashboard" ? DASHBOARDS[dashCtx].actingAs : undefined} notice={screen === "dashboard" ? undefined : "Design proof · invented sample people, companies and figures"}>
      {screen === "dashboard" ? <Dashboard ctx={dashCtx} onCtx={setDashCtx} /> : null}
      {screen === "today" ? <TodayScreen onOpenProject={() => setScreen("project")} onOpenTeam={() => setScreen("team")} onOpenChat={() => setScreen("chat")} /> : null}
      {screen === "people" ? <PeopleSearch selectedId={selected} onSelect={setSelected} onOpenProfile={openProfile} inTeam={teamIds} onAddToTeam={addToTeam} teamLabel="Add to Harbour team" /> : null}
      {screen === "profile" ? <ProfileScreen person={personById(profileId)} onBack={() => setScreen("people")} onAdd={addToTeam} inTeam={teamIds.includes(profileId)} /> : null}
      {screen === "cv" ? (
        <div>
          <div className="mx-auto max-w-[1180px] px-4 pt-7 md:px-8">
            <Segmented label="Data density" value={cvId} onChange={setCvId} options={CV_PEOPLE.map((c) => ({ id: c.id, label: c.label }))} />
          </div>
          <LivingCv person={personById(cvId)} actions={<><Btn kind="secondary" size="sm">Message</Btn><Btn kind="primary" size="sm">Add to team</Btn></>} />
        </div>
      ) : null}
      {screen === "team" ? <TeamFormation seats={seats} setSeats={setSeats} onOpenProfile={openProfile} onConfirm={() => setConfirmed(true)} confirmed={confirmed} /> : null}
      {screen === "project" ? <ProjectScreen seats={projectSeats} onOpenProfile={openProfile} onOpenChat={() => setScreen("chat")} /> : null}
      {screen === "chat" ? <ConversationScreen seats={projectSeats} initialOpen={chatOpen} /> : null}
      {screen === "market" ? <MarketScreen /> : null}
    </AppShell>
    </>
  );
}

export const _people = PEOPLE;
