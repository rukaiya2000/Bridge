import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ActionIcon, AppShell, Avatar, Badge, Box, Burger, Center, Code, Grid, Group, Loader, NavLink, Paper, Select, Stack, Text,
  ThemeIcon, Title, Tooltip, useComputedColorScheme, useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconApps, IconChartBar, IconHeartHandshake, IconLayoutDashboard, IconMoon, IconShieldLock, IconSun } from "@tabler/icons-react";
import { API_URL, fetchRatings, fetchTopics, fetchWeek, fetchWeeks } from "./api";
import { formatWeek, previousWeek } from "./format";
import { HoursChart, Privacy, Stats, Tools, TopicsChart } from "./sections";

const CHILD_ID = "demo";
const REFRESH_MS = 15_000;
const SEED = "for f in sample_prev_week sample_week; do curl -X POST localhost:8000/sync -H 'content-type: application/json' --data @api/fixtures/$f.json; done";

export function App() {
  const [navOpen, nav] = useDisclosure();
  const [picked, setPicked] = useState<string | null>(null);

  const weeks = useQuery({ queryKey: ["weeks", CHILD_ID], queryFn: () => fetchWeeks(CHILD_ID), refetchInterval: REFRESH_MS });
  const selected = picked ?? weeks.data?.[0] ?? null;
  const prevKey = selected && weeks.data?.includes(previousWeek(selected)) ? previousWeek(selected) : null;
  const week = useQuery({ queryKey: ["week", CHILD_ID, selected], queryFn: () => fetchWeek(CHILD_ID, selected!), enabled: !!selected, refetchInterval: REFRESH_MS });
  const prev = useQuery({ queryKey: ["week", CHILD_ID, prevKey], queryFn: () => fetchWeek(CHILD_ID, prevKey!), enabled: !!prevKey });
  const topics = useQuery({ queryKey: ["topics", CHILD_ID, selected], queryFn: () => fetchTopics(CHILD_ID, selected!), enabled: !!selected, refetchInterval: REFRESH_MS });
  const ratings = useQuery({ queryKey: ["ratings"], queryFn: fetchRatings, staleTime: Infinity });

  const failed = [weeks, week, topics, ratings].some((q) => q.isError);
  const ready = week.data && topics.data && ratings.data;

  let body;
  if (failed) {
    body = <Notice title="Can't reach the Bridge API" text={`Nothing answered at ${API_URL}. Start it with:`} code="uv run --group api uvicorn api.main:app --reload" />;
  } else if (weeks.data?.length === 0) {
    body = <Notice title="No data yet" text="The API is connected, but nothing has been synced. Load the demo weeks with:" code={SEED} />;
  } else if (!ready) {
    body = <Center h={400}><Loader /></Center>;
  } else {
    body = (
      <Stack gap="xl">
        <Stats week={week.data!} prev={prev.data ?? null} />
        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, lg: 6 }}><TopicsChart topics={topics.data!} /></Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}><HoursChart week={week.data!} /></Grid.Col>
        </Grid>
        <Tools sites={week.data!.sites} ratings={ratings.data!} />
        <Privacy />
      </Stack>
    );
  }

  return (
    <AppShell header={{ height: 68 }} navbar={{ width: 260, breakpoint: "sm", collapsed: { mobile: !navOpen } }} padding="xl">
      <AppShell.Header px="lg">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={navOpen} onClick={nav.toggle} hiddenFrom="sm" size="sm" />
            <Box visibleFrom="xs">
              <Title order={3}>Weekly overview</Title>
              <Text size="xs" c="dimmed">How your teen's week with AI chatbots went</Text>
            </Box>
          </Group>
          <Group gap="sm" wrap="nowrap">
            {week.dataUpdatedAt > 0 && !failed && (
              <Tooltip label={`Updated ${new Date(week.dataUpdatedAt).toLocaleTimeString()}, refreshes every 15 s`}>
                <Badge variant="dot" color="teal" size="lg" visibleFrom="md">Live</Badge>
              </Tooltip>
            )}
            {weeks.data && weeks.data.length > 0 && (
              <Select w={170} value={selected} onChange={(v) => v && setPicked(v)} allowDeselect={false} aria-label="Week"
                data={weeks.data.map((w) => ({ value: w, label: formatWeek(w) }))} />
            )}
            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section>
          <Group gap="sm" mb="xl" px="xs">
            <ThemeIcon size={40} radius="md" variant="gradient" gradient={{ from: "indigo", to: "violet", deg: 135 }}>
              <IconHeartHandshake size={24} />
            </ThemeIcon>
            <div>
              <Text fw={800} size="lg" lh={1.1}>Bridge</Text>
              <Text size="xs" c="dimmed">Topics, not words</Text>
            </div>
          </Group>
          <Paper withBorder p="sm" radius="md" mb="lg">
            <Group gap="sm" wrap="nowrap">
              <Avatar color="indigo" radius="xl">DT</Avatar>
              <div>
                <Text size="sm" fw={600}>Demo teen</Text>
                <Text size="xs" c="dimmed">Extension on</Text>
              </div>
            </Group>
          </Paper>
        </AppShell.Section>
        <AppShell.Section grow>
          <NavLink href="#" label="Overview" leftSection={<IconLayoutDashboard size={18} />} active variant="light" onClick={nav.close} />
          <NavLink href="#topics" label="Topics" leftSection={<IconChartBar size={18} />} onClick={nav.close} />
          <NavLink href="#tools" label="AI tools" leftSection={<IconApps size={18} />} onClick={nav.close} />
          <NavLink href="#privacy" label="Privacy" leftSection={<IconShieldLock size={18} />} onClick={nav.close} />
        </AppShell.Section>
        <AppShell.Section>
          <Text size="xs" c="dimmed" px="xs">A supplement to talking with your teen, not a safety guarantee.</Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main bg="var(--mantine-color-default-hover)">{body}</AppShell.Main>
    </AppShell>
  );
}

function Notice({ title, text, code }: { title: string; text: string; code: string }) {
  return (
    <Center h={420}>
      <Paper withBorder p="xl" radius="lg" maw={640}>
        <Title order={3} mb="xs">{title}</Title>
        <Text c="dimmed" mb="md">{text}</Text>
        <Code block>{code}</Code>
      </Paper>
    </Center>
  );
}

function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light");
  return (
    <ActionIcon variant="default" size="lg" aria-label="Toggle color scheme" onClick={() => setColorScheme(scheme === "dark" ? "light" : "dark")}>
      {scheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
    </ActionIcon>
  );
}
