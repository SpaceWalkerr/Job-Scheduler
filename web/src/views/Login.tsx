import { AuthUI } from "../components/ui/auth-ui";

export default function Login({ onAuthed }: { onAuthed: (email: string) => void }) {
  return (
    <AuthUI onAuthed={onAuthed} />
  );
}
