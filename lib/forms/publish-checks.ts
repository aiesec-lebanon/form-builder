import { collectsAnswer } from "./fields";
import { allFields, isChoiceField, type FormDocument } from "./schema";

// Blocking checks before publishing (spec §8). Messages say how to fix.

export type PublishProblem = {
  id: string;
  message: string;
  tab: "questions" | "connect" | "settings";
  fieldId?: string;
};

export function publishProblems(doc: FormDocument, context: { hasPrimaryDestination: boolean; hasFileStorage: boolean }): PublishProblem[] {
  const problems: PublishProblem[] = [];
  const add = (problem: PublishProblem) => problems.push(problem);
  const fields = allFields(doc);

  if (!doc.title.trim()) add({ id: "title", message: "Give your form a title.", tab: "questions" });
  if (!fields.some(collectsAnswer)) add({ id: "no-questions", message: "Add at least one question.", tab: "questions" });

  fields.forEach((field, index) => {
    const where = `Question ${index + 1}`;
    if (field.type === "statement") {
      if (!field.label.trim() && !field.description.trim()) add({ id: `empty-${field.id}`, message: `${where}: add text to this text block or remove it.`, tab: "questions", fieldId: field.id });
      return;
    }
    if (!field.label.trim()) add({ id: `label-${field.id}`, message: `${where}: add a question title.`, tab: "questions", fieldId: field.id });

    if (isChoiceField(field)) {
      if (field.options.length === 0) add({ id: `options-${field.id}`, message: `${where}: add at least one option.`, tab: "questions", fieldId: field.id });
      else if (field.options.some((option) => !option.label.trim())) add({ id: `blank-option-${field.id}`, message: `${where}: fill in or remove empty options.`, tab: "questions", fieldId: field.id });
      if (field.type === "multi_choice") {
        const available = field.options.length + (field.allowOther ? 1 : 0);
        if (field.minSelected !== null && field.minSelected > available) add({ id: `min-${field.id}`, message: `${where}: the minimum selection is more than the options available.`, tab: "questions", fieldId: field.id });
        if (field.minSelected !== null && field.maxSelected !== null && field.minSelected > field.maxSelected) add({ id: `range-${field.id}`, message: `${where}: the minimum selection is greater than the maximum.`, tab: "questions", fieldId: field.id });
      }
    }
    if ((field.type === "short_text" || field.type === "long_text") && field.minLength !== null && field.maxLength !== null && field.minLength > field.maxLength) {
      add({ id: `length-${field.id}`, message: `${where}: the minimum length is greater than the maximum.`, tab: "questions", fieldId: field.id });
    }
    if (field.type === "number" && field.min !== null && field.max !== null && field.min > field.max) {
      add({ id: `number-${field.id}`, message: `${where}: the minimum is greater than the maximum.`, tab: "questions", fieldId: field.id });
    }
    if (field.type === "date" && field.min && field.max && field.min > field.max) {
      add({ id: `date-${field.id}`, message: `${where}: the earliest date is after the latest date.`, tab: "questions", fieldId: field.id });
    }
  });

  if (!context.hasPrimaryDestination) add({ id: "destination", message: "Choose where responses should go.", tab: "connect" });
  if (fields.some((field) => field.type === "file_upload") && !context.hasFileStorage) {
    add({ id: "file-storage", message: "File questions need Google Drive to store uploads. Connect it in Connect.", tab: "connect" });
  }
  return problems;
}
