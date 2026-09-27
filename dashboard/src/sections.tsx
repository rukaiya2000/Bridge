// Dashboard sections. Layout, cards and charts come from Mantine; this file only arranges our data.
import type { ReactNode } from "react";
import {
  Avatar, Badge, Box, Card, Group, List, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title,
} from "@mantine/core";
import { BarChart } from "@mantine/charts";
import {
  IconArrowDownRight, IconArrowUpRight, IconBell, IconClock, IconEye, IconEyeOff,
  IconLock, IconMicrophone, IconMoonStars,
} from "@tabler/icons-react";
import type { SiteAggregate, ToolRating, TopicTrend, Week } from "./api";
import { hourLabel, hours, isLate, LEVEL_COLOR, sum, topicLabel } from "./format";

const EXCLUDED = ["Sexual orientation or gender identity", "Abuse or conflict at home", "Sexual health", "Religion"];
const SITE_COLOR: Record<string, string> = { gemini: "blue", chatgpt: "teal", claude: "orange", characterai: "pink" };

// value null: nothing synced to this account yet.
function Stat({ label, value, icon, color, now, before, format }: {
  label: string; value: string | null; icon: ReactNode; color: string; now: number; before: number | null; format: (n: number) => string;
}) {
  const diff = before === null ? null : now - before;
  return (
    <Paper withBorder p="lg" radius="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
          <Text fz={28} fw={700} mt={4} c={value === null ? "dimmed" : undefined}>{value ?? "—"}</Text>
        </div>
        <ThemeIcon size={44} radius="md" variant="light" color={color} style={{ flexShrink: 0 }}>{icon}</ThemeIcon>
      </Group>
      <Text size="sm" mt="sm" c="dimmed">
        {value === null ? "Nothing synced yet" : diff === null ? "No data for last week" : diff === 0 ? "Same as last week" : (
          <Text span inherit c={diff > 0 ? "orange.7" : "teal.7"} fw={600}>
            {diff > 0 ? <IconArrowUpRight size={14} style={{ verticalAlign: -2 }} /> : <IconArrowDownRight size={14} style={{ verticalAlign: -2 }} />}
            {" "}{format(Math.abs(diff))} {diff > 0 ? "more" : "less"} than last week
          </Text>
        )}
      </Text>
    </Paper>
  );
}

// week null: nothing synced to this account yet, so every tile shows a dash.
export function Stats({ week, prev }: { week: Week | null; prev: Week | null }) {
  const p = prev?.sites ?? null;
  const n = (x: number) => String(x);
  const sites = week?.sites ?? [];
  const show = (f: (x: number) => string, x: number) => (week ? f(x) : null);
  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 3, xl: 5 }} spacing="lg">
      <Stat label="Time on AI" value={show(hours, sum(sites, "active_minutes"))} icon={<IconClock size={24} />} color="indigo"
        now={sum(sites, "active_minutes")} before={p && sum(p, "active_minutes")} format={hours} />
      <Stat label="Late nights" value={show(n, sum(sites, "late_night_sessions"))} icon={<IconMoonStars size={24} />} color="grape"
        now={sum(sites, "late_night_sessions")} before={p && sum(p, "late_night_sessions")} format={n} />
      <Stat label="Voice chat" value={show(hours, sum(sites, "voice_minutes"))} icon={<IconMicrophone size={24} />} color="cyan"
        now={sum(sites, "voice_minutes")} before={p && sum(p, "voice_minutes")} format={hours} />
      <Stat label="Nudges shown" value={show(n, sum(sites, "nudges_shown"))} icon={<IconBell size={24} />} color="yellow"
        now={sum(sites, "nudges_shown")} before={p && sum(p, "nudges_shown")} format={n} />
      <Stat label="Privacy pauses" value={show(n, sum(sites, "privacy_pauses"))} icon={<IconLock size={24} />} color="teal"
        now={sum(sites, "privacy_pauses")} before={p && sum(p, "privacy_pauses")} format={n} />
    </SimpleGrid>
  );
}

function Section({ id, title, subtitle, children }: { id?: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card id={id} withBorder radius="lg" padding="lg" h="100%">
      <Title order={4}>{title}</Title>
      {subtitle && <Text size="sm" c="dimmed" mb="md">{subtitle}</Text>}
      {children}
    </Card>
  );
}

// topics null: nothing synced to this account yet.
export function TopicsChart({ topics }: { topics: TopicTrend[] | null }) {
  const data = (topics ?? []).map((t) => ({ topic: topicLabel(t.topic), last_week: t.last_week, this_week: t.this_week }));
  return (
    <Section id="topics" title="Topics this week vs last week" subtitle="How often each topic came up. Topics only, never words.">
      {data.length ? (
        <BarChart h={Math.max(220, data.length * 56)} data={data} dataKey="topic" orientation="vertical" withLegend
          legendProps={{ verticalAlign: "top", height: 36 }} yAxisProps={{ width: 90 }} gridAxis="x" barProps={{ radius: 6 }}
          series={[{ name: "last_week", label: "Last week", color: "indigo.2" }, { name: "this_week", label: "This week", color: "indigo.6" }]} />
      ) : <Text c="dimmed">{topics ? "No topics this week." : "Topics show up here after the extension's first sync."}</Text>}
    </Section>
  );
}

export function HoursChart({ week }: { week: Week | null }) {
  if (!week) {
    return (
      <Section title="Time of day" subtitle="When topics came up across the week.">
        <Text c="dimmed">The busiest hours show up here after the extension's first sync.</Text>
      </Section>
    );
  }
  const data = Array.from({ length: 24 }, (_, h) => {
    const count = week.hourly_topics.filter((t) => t.hour === h).reduce((n, t) => n + t.count, 0);
    return { hour: hourLabel(h), day: isLate(h) ? 0 : count, late: isLate(h) ? count : 0 };
  });
  return (
    <Section title="Time of day" subtitle="When topics came up across the week.">
      <BarChart h={260} data={data} dataKey="hour" type="stacked" withLegend legendProps={{ verticalAlign: "top", height: 36 }}
        gridAxis="y" barProps={{ radius: 4 }} xAxisProps={{ interval: 5 }}
        series={[{ name: "day", label: "Daytime", color: "indigo.5" }, { name: "late", label: "Late night (11pm–5am)", color: "grape.6" }]} />
    </Section>
  );
}

export function Tools({ sites, ratings }: { sites: SiteAggregate[]; ratings: ToolRating[] }) {
  const bySite = new Map(ratings.map((r) => [r.site, r]));
  const sorted = [...sites].sort((a, b) => b.active_minutes - a.active_minutes);
  return (
    <Box id="tools" h="100%" style={{ display: "flex", flexDirection: "column" }}>
      <Group justify="space-between" mb="md">
        <Text size="sm" c="dimmed">Ratings are hand-curated, never generated</Text>
      </Group>
      <Stack gap="lg" style={{ flex: 1 }}>
        {sorted.map((s) => {
          const r = bySite.get(s.site);
          const stats = [
            ["Time", hours(s.active_minutes)], ["Late nights", String(s.late_night_sessions)], ["Voice", hours(s.voice_minutes)],
          ];
          return (
            <Card key={s.site} withBorder radius="lg" padding="lg" style={{ flex: sorted.length === 1 ? 1 : undefined }}>
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Avatar color={SITE_COLOR[s.site] ?? "gray"} radius="md" size={44}>{(r?.name ?? s.site).slice(0, 2)}</Avatar>
                  <div style={{ minWidth: 0 }}>
                    <Text fw={700} truncate>{r?.name ?? s.site}</Text>
                    {r && <Text size="xs" c="dimmed" truncate>{r.type === "companion" ? "Companion app" : "General assistant"} · Ages {r.min_age}+</Text>}
                  </div>
                </Group>
                <Badge color={LEVEL_COLOR[s.level]} variant="light" tt="capitalize" style={{ flexShrink: 0 }}>{s.level}</Badge>
              </Group>
              <SimpleGrid cols={4} mt="lg" spacing="xs">
                {stats.map(([k, v]) => (
                  <div key={k}><Text size="xs" c="dimmed">{k}</Text><Text fw={700}>{v}</Text></div>
                ))}
                <div>
                  <Text size="xs" c="dimmed">Plan</Text>
                  {s.paid_tier == null ? <Text fw={700}>Unknown</Text>
                    : s.paid_tier ? <Badge color="orange" variant="light">Paid</Badge> : <Text fw={700}>Free</Text>}
                </div>
              </SimpleGrid>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}

// A short summary for the parent, beside the AI tools.
export function Privacy() {
  // Each list on its own tint (Mantine's light variant colors, which follow dark mode) so the two read apart.
  const block = (color: string, icon: ReactNode, title: string, items: string[]) => (
    <Paper p="md" radius="md" bg={`var(--mantine-color-${color}-light)`}>
      <Group gap={6} mb={4}>{icon}<Text fw={700} size="sm">{title}</Text></Group>
      <List size="sm" spacing={2}>{items.map((i) => <List.Item key={i}>{i}</List.Item>)}</List>
    </Paper>
  );
  return (
    <Box id="privacy" h="100%" style={{ display: "flex", flexDirection: "column" }}>
      <Title order={3} mb="md">What you can and can't see</Title>
      <Card withBorder radius="lg" padding="lg" style={{ flex: 1 }}>
        {/* Side by side once the card itself is wide enough (container query), stacked otherwise. */}
        <SimpleGrid type="container" cols={{ base: 1, "480px": 2 }} spacing="lg" verticalSpacing="md">
          {block("teal", <IconEye size={16} color="var(--mantine-color-teal-6)" />, "You see", [
            "Topics and how often they came up",
            "When and how long, per tool, including voice",
            "Privacy pauses: the kind of info, never the info",
          ])}
          {block("red", <IconEyeOff size={16} color="var(--mantine-color-red-6)" />, "You never see", [
            "Messages, quotes or audio",
            `Sensitive topics: ${EXCLUDED.join(", ").toLowerCase()}`,
          ])}
        </SimpleGrid>
      </Card>
    </Box>
  );
}
