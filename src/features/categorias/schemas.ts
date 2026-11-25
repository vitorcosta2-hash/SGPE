import { z } from "zod";
import { optionalText, requiredText, uuidField } from "@/lib/actions";

export const categorySchema = z.object({
  name: requiredText("o nome da categoria", 80),
  description: optionalText("Descrição", 300),
});

export const categoryIdSchema = z.object({ id: uuidField("a categoria") });
