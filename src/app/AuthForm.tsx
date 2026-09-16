"use client";
import { useActionState } from "react";
import Link from "next/link";
import { authenticate, register } from "../server/auth-actions";
export default function AuthForm({ signup = false }: { signup?: boolean }) {
  const [state, action, pending] = useActionState(
    signup ? register : authenticate,
    { error: "" },
  );
  return (
    <main id="screen">
      <section className="panel">
        <span className="eyebrow">LIMIAR · ECOS DO OBELISCO</span>
        <h1>{signup ? "Criar conta" : "Entrar"}</h1>
        <form action={action} className="stack">
          {signup && (
            <label>
              Nome de usuário
              <input
                name="username"
                required
                minLength={3}
                maxLength={24}
                pattern="[A-Za-z0-9_]+"
                autoComplete="username"
              />
            </label>
          )}
          <label>
            E-mail
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete={signup ? "new-password" : "current-password"}
            />
          </label>
          {signup && (
            <label>
              Confirmar senha
              <input
                name="confirm"
                onInput={(e) => {
                  const confirm = e.currentTarget,
                    password = confirm.form?.elements.namedItem("password");
                  confirm.setCustomValidity(
                    password instanceof HTMLInputElement &&
                      confirm.value !== password.value
                      ? "As senhas precisam ser iguais."
                      : "",
                  );
                }}
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
          )}
          <p role="alert">{state.error}</p>
          <button className="primary" disabled={pending}>
            {pending ? "Aguarde…" : signup ? "CRIAR CONTA" : "ENTRAR"}
          </button>
        </form>
        <div className="actions">
          <Link href={signup ? "/login" : "/register"}>
            {signup ? "Já tenho conta" : "Criar conta"}
          </Link>
          <Link href="/">Voltar</Link>
        </div>
      </section>
    </main>
  );
}
