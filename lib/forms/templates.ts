import { createField } from "./fields";
import { newId } from "./ids";
import { formDocumentSchema, settingsSchema, themeSchema, type Field, type FormDocument, type Page } from "./schema";

// Starting points. Every call returns fresh ids.

export type TemplateId = "blank" | "event" | "feedback" | "contact" | "membership";

export const TEMPLATES: Array<{ id: TemplateId; name: string; description: string }> = [
  { id: "blank", name: "Blank form", description: "Start from scratch" },
  { id: "event", name: "Event registration", description: "Names, contacts, sessions, consent" },
  { id: "feedback", name: "Feedback survey", description: "Ratings and open feedback" },
  { id: "contact", name: "Contact form", description: "Enquiries from partners and youth" },
  { id: "membership", name: "Membership application", description: "Two pages, CV upload" },
];

type FieldInit<F extends Field> = Partial<Omit<F, "id" | "type">>;

function field<T extends Field["type"]>(type: T, init: FieldInit<Extract<Field, { type: T }>> = {}): Field {
  return { ...createField(type), ...init } as Field;
}

function options(...labels: string[]) {
  return labels.map((label) => ({ id: newId("o"), label }));
}

function page(fields: Field[], title = "", description = ""): Page {
  return { id: newId("p"), title, description, fields };
}

function document(title: string, description: string, pages: Page[], accent: FormDocument["theme"]["accent"] = "am"): FormDocument {
  return formDocumentSchema.parse({
    version: 1,
    title,
    description,
    pages,
    settings: settingsSchema.parse({}),
    theme: themeSchema.parse({ accent }),
  });
}

export function blankDocument(title = "Untitled form"): FormDocument {
  return document(title, "", [page([field("short_text")])]);
}

const consentText = "I agree that AIESEC can use this information to contact me about this activity.";

export function templateDocument(id: TemplateId): FormDocument {
  switch (id) {
    case "blank":
      return blankDocument();
    case "event":
      return document("Event registration", "Save your spot. It takes about a minute.", [
        page([
          field("short_text", { label: "Full name", required: true }),
          field("email", { required: true }),
          field("phone"),
          field("short_text", { label: "University or workplace" }),
          field("multi_choice", { label: "Which sessions will you attend?", options: options("Opening ceremony", "Workshops", "Networking evening") }),
          field("short_text", { label: "Dietary requirements", description: "Leave blank if none." }),
          field("consent", { label: "Consent", checkboxLabel: consentText }),
        ]),
      ]);
    case "feedback":
      return document(
        "Event feedback",
        "Tell us how it went. Your feedback shapes the next one.",
        [
          page([
            field("rating", { label: "How would you rate the event overall?", required: true }),
            field("linear_scale", { label: "How likely are you to recommend it to a friend?", min: 0, max: 10, minLabel: "Not likely", maxLabel: "Very likely" }),
            field("long_text", { label: "What did you enjoy most?" }),
            field("long_text", { label: "What should we improve?" }),
            field("email", { label: "Email", description: "Only if you'd like us to follow up." }),
          ]),
        ],
        "ys",
      );
    case "contact":
      return document("Get in touch", "Send us a message and we'll reply within two working days.", [
        page([
          field("short_text", { label: "Your name", required: true }),
          field("email", { required: true }),
          field("short_text", { label: "Organisation" }),
          field("dropdown", { label: "What is it about?", required: true, options: options("Partnership", "Exchange programmes", "Volunteering", "Something else") }),
          field("long_text", { label: "Message", required: true }),
        ]),
      ]);
    case "membership":
      return document("Join AIESEC", "Become a member and develop your leadership. Applications take about five minutes.", [
        page(
          [
            field("short_text", { label: "Full name", required: true }),
            field("email", { required: true }),
            field("phone", { required: true }),
            field("date", { label: "Date of birth" }),
            field("short_text", { label: "University", required: true }),
            field("short_text", { label: "Field of study" }),
          ],
          "About you",
        ),
        page(
          [
            field("single_choice", {
              label: "Which area interests you most?",
              required: true,
              options: options("Talent management", "Marketing", "Business development", "Exchange", "Finance"),
            }),
            field("long_text", { label: "Why do you want to join AIESEC?", required: true, maxLength: 1500 }),
            field("file_upload", { label: "CV", description: "PDF or Word, up to 10 MB.", accept: ["pdf", "document"] }),
            field("consent", { label: "Consent", checkboxLabel: consentText }),
          ],
          "Your motivation",
        ),
      ]);
  }
}
