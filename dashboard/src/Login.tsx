import { useState } from "react";
import { Alert, Anchor, Button, Center, Group, Paper, PasswordInput, Stack, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
import { IconHeartHandshake } from "@tabler/icons-react";
import { logIn, signUp, type Session } from "./api";

// Email + password, one account per family. The extension logs in to the same account on its Options page.
export function Login({ onLoggedIn }: { onLoggedIn: (s: Session) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLoggedIn(await (mode === "login" ? logIn : signUp)(email.trim(), password));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const signup = mode === "signup";
  return (
    <Center mih="100vh" p="md" bg="var(--mantine-color-default-hover)">
      <Paper withBorder shadow="sm" p="xl" radius="lg" w="100%" maw={400}>
        <form onSubmit={submit}>
          <Stack>
            <Group gap="sm">
              <ThemeIcon size={40} radius="md" variant="gradient" gradient={{ from: "indigo", to: "violet", deg: 135 }}>
                <IconHeartHandshake size={24} />
              </ThemeIcon>
              <div>
                <Title order={3}>{signup ? "Create your Bridge account" : "Log in to Bridge"}</Title>
                <Text size="xs" c="dimmed">Use the same account in the extension's Options page</Text>
              </div>
            </Group>
            {error && <Alert color="red" variant="light">{error}</Alert>}
            <TextInput label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
            <PasswordInput label="Password" autoComplete={signup ? "new-password" : "current-password"} required
              minLength={signup ? 8 : undefined} description={signup ? "At least 8 characters" : undefined}
              value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
            <Button type="submit" loading={busy} fullWidth>{signup ? "Sign up" : "Log in"}</Button>
            <Text size="sm" ta="center">
              {signup ? "Already have an account? " : "New here? "}
              <Anchor component="button" type="button" onClick={() => { setMode(signup ? "login" : "signup"); setError(null); }}>
                {signup ? "Log in" : "Create an account"}
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
