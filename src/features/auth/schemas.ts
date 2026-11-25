import { z } from "zod";
import { requiredText } from "@/lib/actions";

export const PASSWORD_MIN_LENGTH = 8;

const email = z
  .string({ error: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail muito longo.")
  .pipe(z.email({ error: "Informe um e-mail válido." }));

const password = z
  .string({ error: "Informe a senha." })
  .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(72, "A senha deve ter no máximo 72 caracteres.");

export const signInSchema = z.object({
  email,
  password: z.string({ error: "Informe a senha." }).min(1, "Informe a senha."),
  next: z.string().optional(),
});

export const signUpSchema = z
  .object({
    full_name: requiredText("seu nome", 120, 2),
    company_name: requiredText("o nome da empresa", 120, 2),
    email,
    password,
    password_confirm: z.string({ error: "Confirme a senha." }).min(1, "Confirme a senha."),
  })
  .refine((v) => v.password === v.password_confirm, { path: ["password_confirm"], message: "As senhas não conferem." });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password,
    password_confirm: z.string({ error: "Confirme a senha." }).min(1, "Confirme a senha."),
  })
  .refine((v) => v.password === v.password_confirm, { path: ["password_confirm"], message: "As senhas não conferem." });

export const createCompanySchema = z.object({
  company_name: requiredText("o nome da empresa", 120, 2),
});
