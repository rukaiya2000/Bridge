// Dashboard sections. Layout, cards and charts come from Mantine; this file only arranges our data.
import type { ReactNode } from "react";
import {
  Avatar, Badge, Box, Card, Group, List, Paper, SimpleGrid, Text, ThemeIcon, Timeline, Title,
} from "@mantine/core";
import { format, parseISO } from "date-fns";
import { BarChart } from "@mantine/charts";
import {
  IconArrowDownRight, IconArrowUpRight, IconBell, IconBulb, IconClock, IconEye, IconEyeOff,
  IconLock, IconMicrophone, IconMoonStars, IconShieldCheck, IconShieldLock,
} from "@tabler/icons-react";
import type { SiteAggregate, ToolRating, TopicTrend, Week } from "./api";
import { FINDING_LABEL, hourLabel, hours, isLate, LEVEL_COLOR, sum, topicLabel } from "./format";

const EXCLUDED = ["Sexual orientation or gender identity", "Abuse or conflict at home", "Sexual health", "Religion"];
const SITE_COLOR: Record<string, string> = { gemini: "blue", chatgpt: "teal", claude: "orange", characterai: "pink" };

function Stat({ label, value, icon, color, now, before, format }: {
  label: string; value: string; icon: ReactNode; color: string; now: number; before: number | null; format: (n: number) => string;
}) {
  const diff = before === null ? null : now - before;
  return (
    <Paper withBorder p="lg" radius="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
          <Text fz={28} fw={700} mt={4}>{value}</Text>
        </div>
        <ThemeIcon size={44} radius="md" variant="light" color={color}>{icon}</ThemeIcon>
      </Group>
      <Text size="sm" mt="sm" c="dimmed">
        {diff === null ? "No data for last week" : diff === 0 ? "Same as last week" : (
          <Text span inherit c={diff > 0 ? "orange.7" : "teal.7"} fw={600}>
            {diff > 0 ? <IconArrowUpRight size={14} style={{ verticalAlign: -2 }} /> : <IconArrowDownRight size={14} style={{ verticalAlign: -2 }} />}
            {" "}{format(Math.abs(diff))} {diff > 0 ? "more" : "less"} than last week
          </Text>
        )}
      </Text>
    </Paper>
  );
}

export function Stats({ week, prev }: { week: Week; prev: Week | null }) {
  const p = prev?.sites ?? null;
  const n = (x: number) => String(x);
  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 3, xl: 5 }} spacing="lg">
      <Stat label="Time on AI" value={hours(sum(week.sites, "active_minutes"))} icon={<IconClock size={24} />} color="indigo"
        now={sum(week.sites, "active_minutes")} before={p && sum(p, "active_minutes")} format={hours} />
      <Stat label="Late-night sessions" value={n(sum(week.sites, "late_night_sessions"))} icon={<IconMoonStars size={24} />} color="grape"
        now={sum(week.sites, "late_night_sessions")} before={p && sum(p, "late_night_sessions")} format={n} />
      <Stat label="Voice chat" value={hours(sum(week.sites, "voice_minutes"))} icon={<IconMicrophone size={24} />} color="cyan"
        now={sum(week.sites, "voice_minutes")} before={p && sum(p, "voice_minutes")} format={hours} />
      <Stat label="Nudges shown" value={n(sum(week.sites, "nudges_shown"))} icon={<IconBell size={24} />} color="yellow"
        now={sum(week.sites, "nudges_shown")} before={p && sum(p, "nudges_shown")} format={n} />
      <Stat label="Privacy pauses" value={n(sum(week.sites, "privacy_pauses"))} icon={<IconLock size={24} />} color="teal"
        now={sum(week.sites, "privacy_pauses")} before={p && sum(p, "privacy_pauses")} format={n} />
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

export function TopicsChart({ topics }: { topics: TopicTrend[] }) {
  const data = topics.map((t) => ({ topic: topicLabel(t.topic), last_week: t.last_week, this_week: t.this_week }));
  return (
    <Section id="topics" title="Topics this week vs last week" subtitle="How often each topic came up. Topics only, never words.">
      {data.length ? (
        <BarChart h={Math.max(220, data.length * 56)} data={data} dataKey="topic" orientation="vertical" withLegend
          legendProps={{ verticalAlign: "top", height: 36 }} yAxisProps={{ width: 90 }} gridAxis="x" barProps={{ radius: 6 }}
          series={[{ name: "last_week", label: "Last week", color: "indigo.2" }, { name: "this_week", label: "This week", color: "indigo.6" }]} />
      ) : <Text c="dimmed">No topics this week.</Text>}
    </Section>
  );
}

export function HoursChart({ week }: { week: Week }) {
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
    <Box id="tools">
      <Group justify="space-between" mb="md">
        <Title order={3}>AI tools used this week</Title>
        <Text size="sm" c="dimmed">Ratings are hand-curated, never generated</Text>
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {sorted.map((s) => {
          const r = bySite.get(s.site);
          const stats = [
            ["Time", hours(s.active_minutes)], ["Late nights", String(s.late_night_sessions)], ["Voice", hours(s.voice_minutes)],
          ];
          return (
            <Card key={s.site} withBorder radius="lg" padding="lg">
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
              {r && (
                <Paper mt="lg" p="sm" radius="md" bg="var(--mantine-color-default-hover)">
                  <Group gap="xs" wrap="nowrap" align="flex-start">
                    <ThemeIcon size="sm" radius="xl" variant="light" color={r.type === "companion" ? "orange" : "teal"}>
                      <IconBulb size={14} />
                    </ThemeIcon>
                    <div>
                      <Text size="sm" fw={600}>{r.recommendation}</Text>
                      <Text size="xs" c="dimmed">Teen safety settings: {r.teen_safety_settings ? "available" : "none"}</Text>
                    </div>
                  </Group>
                </Paper>
              )}
            </Card>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}

// Every mic use and every paused piece of personal info this week, newest first.
export function Activity({ week, ratings }: { week: Week; ratings: ToolRating[] }) {
  const name = (site: string) => ratings.find((r) => r.site === site)?.name ?? site;
  const items = [
    ...week.voice_sessions.map((v) => ({
      date: v.date, hour: v.hour, key: `v${v.date}${v.hour}${v.site}${v.minutes}`,
      icon: <IconMicrophone size={14} />, color: "cyan",
      title: `Used the microphone on ${name(v.site)}`,
      detail: v.minutes < 1 ? "Less than a minute" : `For ${hours(v.minutes)}`,
      badge: null,
    })),
    ...week.privacy_flags.map((f) => ({
      date: f.date, hour: f.hour, key: `p${f.date}${f.hour}${f.site}${f.findings}${f.sent}`,
      icon: <IconLock size={14} />, color: f.sent ? "orange" : "teal",
      title: `Tried to share ${f.findings.map((k) => FINDING_LABEL[k] ?? k).join(", ")} on ${name(f.site)}`,
      detail: f.what === "file" ? "In an uploaded file" : "In a message",
      badge: f.sent ? <Badge color="orange" variant="light">Sent anyway</Badge> : <Badge color="teal" variant="light">Held back</Badge>,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.hour - a.hour);

  return (
    <Section id="activity" title="Microphone and personal info"
      subtitle="Each time your teen used voice chat, and each time Bridge paused personal info. The kind of info only, never the info itself.">
      {items.length ? (
        <Timeline bulletSize={26} lineWidth={2}>
          {items.map((i) => (
            <Timeline.Item key={i.key} bullet={<ThemeIcon size={26} radius="xl" variant="light" color={i.color}>{i.icon}</ThemeIcon>}
              title={<Group gap="xs"><Text fw={600} size="sm">{i.title}</Text>{i.badge}</Group>}>
              <Text size="xs" c="dimmed">
                {format(parseISO(i.date), "EEE MMM d")}, {hourLabel(i.hour)} · {i.detail}
                {isLate(i.hour) && <Text span inherit c="grape.6" fw={600}> · late night</Text>}
              </Text>
            </Timeline.Item>
          ))}
        </Timeline>
      ) : <Text c="dimmed">No microphone use or personal info this week.</Text>}
    </Section>
  );
}

export function Privacy() {
  return (
    <Card id="privacy" withBorder radius="lg" padding="xl">
      <Group gap="sm" mb="lg">
        <ThemeIcon size={40} radius="md" variant="light" color="teal"><IconShieldLock size={22} /></ThemeIcon>
        <div>
          <Title order={3}>What you can and can't see</Title>
          <Text size="sm" c="dimmed">Bridge shares topics, not words. Your teen can see that Bridge is on.</Text>
        </div>
      </Group>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
        <div>
          <Group gap={6} mb="xs"><IconEye size={18} color="var(--mantine-color-teal-6)" /><Text fw={700}>You see</Text></Group>
          <List size="sm" spacing={4}>
            <List.Item>Topics and how often they came up</List.Item>
            <List.Item>Time of day and time per tool</List.Item>
            <List.Item>An overall level and a conversation starter</List.Item>
            <List.Item>When the microphone was used, and for how long</List.Item>
            <List.Item>When personal info was paused: the kind, and whether it was sent</List.Item>
          </List>
        </div>
        <div>
          <Group gap={6} mb="xs"><IconEyeOff size={18} color="var(--mantine-color-red-6)" /><Text fw={700}>You never see</Text></Group>
          <List size="sm" spacing={4}>
            <List.Item>Your teen's messages or any quotes</List.Item>
            <List.Item>Any audio: Bridge never records the microphone</List.Item>
            <List.Item>The personal info itself (the number, address, ...)</List.Item>
            {EXCLUDED.map((t) => <List.Item key={t}>{t}</List.Item>)}
          </List>
        </div>
        <div>
          <Group gap={6} mb="xs"><IconShieldCheck size={18} color="var(--mantine-color-indigo-6)" /><Text fw={700}>How it's protected</Text></Group>
          <List size="sm" spacing={4}>
            <List.Item>Messages are never stored or sent to Bridge's servers; only labels are kept</List.Item>
            <List.Item>Only counts are synced, then deleted after 8 weeks</List.Item>
            <List.Item>If there are signs of abuse at home, alerts are held back</List.Item>
            <List.Item>Phone numbers, addresses, IDs and passwords are caught before they're sent to a chatbot. You see the kind and when, never the value</List.Item>
          </List>
        </div>
      </SimpleGrid>
    </Card>
  );
}
