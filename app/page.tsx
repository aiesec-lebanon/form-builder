import { Alert, Badge, Button, TextField } from "@/components/aiesec";
import { AppMark } from "@/components/brand/Logo";

// Temporary design-system check page; replaced by the sign-in redirect in T05.
export default function Home() {
  return (
    <main className="ae-container flex flex-col gap-6 py-12">
      <AppMark />
      <h1 className="ae-h1">
        Build a form in <strong>a minute</strong>
      </h1>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary">Create form</Button>
        <Button>Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Badge tone="success">Live</Badge>
      </div>
      <TextField label="Form title" placeholder="Untitled form" />
      <Alert tone="info" title="Responses go to your destination">
        We never store answers.
      </Alert>
    </main>
  );
}
