import { describe, expect, it } from "vitest";

import {
  WHOXOS_QUESTION_RESPONSE_SCHEMA,
  WHOXOS_QUESTION_SET_SCHEMA,
  parseWHOXOSQuestionResponse,
  parseWHOXOSQuestionSet,
  type WHOXOSQuestionSet,
} from "./question-set.js";

const questionSet: WHOXOSQuestionSet = {
  schema: WHOXOS_QUESTION_SET_SCHEMA,
  title: "Release input",
  questions: [
    {
      id: "environment",
      prompt: "Where should we deploy?",
      required: true,
      answerMode: "single_select",
      options: [
        { id: "staging", label: "Staging", recommended: true },
        { id: "production", label: "Production" },
      ],
      customAnswer: { enabled: true, label: "Other" },
    },
    {
      id: "replicas",
      prompt: "How many replicas?",
      required: true,
      answerMode: "text",
      textValidation: { inputType: "integer", minimum: 1, maximum: 20 },
    },
  ],
};

describe("WHOXOS question-set contract", () => {
  it("round-trips the portable presentation model", () => {
    expect(parseWHOXOSQuestionSet(questionSet)).toEqual(questionSet);
    expect(parseWHOXOSQuestionResponse(questionSet, {
      schema: WHOXOS_QUESTION_RESPONSE_SCHEMA,
      answers: {
        environment: { selectedOptionIds: ["staging"] },
        replicas: { text: "3" },
      },
    })).toEqual({
      schema: WHOXOS_QUESTION_RESPONSE_SCHEMA,
      answers: {
        environment: { selectedOptionIds: ["staging"] },
        replicas: { text: "3" },
      },
    });
  });

  it("rejects missing, unknown, and provider-shaped answers", () => {
    expect(() => parseWHOXOSQuestionResponse(questionSet, {
      schema: WHOXOS_QUESTION_RESPONSE_SCHEMA,
      answers: { environment: { selectedOptionIds: ["unknown"] }, replicas: { text: "3" } },
    })).toThrow(/unknown option/);
    expect(() => parseWHOXOSQuestionResponse(questionSet, {
      schema: WHOXOS_QUESTION_RESPONSE_SCHEMA,
      answers: { environment: { selectedOptionIds: ["staging"] } },
    })).toThrow(/replicas.*required/);
    expect(() => parseWHOXOSQuestionResponse(questionSet, {
      answers: { environment: { answers: ["Staging"] } },
    })).toThrow(/whoxos.question_response.v1/);
    expect(() => parseWHOXOSQuestionResponse(questionSet, {
      schema: WHOXOS_QUESTION_RESPONSE_SCHEMA,
      answers: {
        environment: { answers: ["Staging"] },
        replicas: { text: "3" },
      },
    })).toThrow(/canonical response contract/);
  });

  it("applies typed numeric validation before an adapter sees the answer", () => {
    expect(() => parseWHOXOSQuestionResponse(questionSet, {
      schema: WHOXOS_QUESTION_RESPONSE_SCHEMA,
      answers: {
        environment: { customText: "Canary" },
        replicas: { text: "3.5" },
      },
    })).toThrow(/valid integer/);
    expect(() => parseWHOXOSQuestionResponse(questionSet, {
      schema: WHOXOS_QUESTION_RESPONSE_SCHEMA,
      answers: {
        environment: { customText: "Canary" },
        replicas: { text: "21" },
      },
    })).toThrow(/at most 20/);
  });
});
