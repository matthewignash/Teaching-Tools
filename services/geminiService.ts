import { GoogleGenAI, Type, Schema } from "@google/genai";
import { RubricItem, AiGradingResult, QuestionType } from "../types";

// Ensure API key is present
const apiKey = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

export const generateRubricFromPDF = async (base64Data: string, mimeType: string): Promise<RubricItem[]> => {
  if (!apiKey) throw new Error("API Key not found");

  const model = "gemini-2.5-flash";
  
  const responseSchema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING, description: "The question text, number, or summary" },
        maxPoints: { type: Type.NUMBER, description: "The maximum points allocated" },
        criteria: { type: Type.STRING, description: "Grading criteria or description" },
        type: { type: Type.STRING, enum: ["MCQ", "FRQ"], description: "Multiple Choice (MCQ) or Free Response (FRQ)" },
        correctAnswer: { type: Type.STRING, description: "If MCQ, the correct letter (A, B, C, D). If unknown, leave empty." }
      },
      required: ["question", "maxPoints", "criteria", "type"]
    }
  };

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data
            }
          },
          {
            text: "Analyze this document. It is likely an Answer Key or an Exam. Create a structured grading rubric. \n\nIMPORTANT: If this is an Answer Key with a list of letters (e.g., 1. A, 2. B), mark them as 'MCQ' and set the 'correctAnswer' field. For essay/short answer questions, mark as 'FRQ'."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: "You are an educational assessment specialist. Parse answer keys accurately."
      }
    });

    const text = response.text;
    if (!text) return [];
    
    const data = JSON.parse(text);
    // Add unique IDs
    return data.map((item: any, index: number) => ({
      id: `q-${Date.now()}-${index}`,
      ...item
    }));

  } catch (error) {
    console.error("Gemini Rubric Generation Error:", error);
    throw error;
  }
};

export const parseStudentRoster = async (base64Data: string, mimeType: string): Promise<string[]> => {
  if (!apiKey) throw new Error("API Key not found");

  const model = "gemini-2.5-flash";
  
  const responseSchema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.STRING
    }
  };

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data
            }
          },
          {
            text: "Analyze this document. It appears to be a student roster, class list, or spreadsheet of names (e.g., 'Last Name, First Name' or 'First Name Last Name'). Extract all student names and return them as a simple list of strings in 'First Name Last Name' format. Ignore header rows."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: "You are a helpful assistant that extracts data from documents. Extract full names of people found in the list/table."
      }
    });

    const text = response.text;
    if (!text) return [];
    
    return JSON.parse(text);

  } catch (error) {
    console.error("Gemini Roster Parsing Error:", error);
    throw error;
  }
};

interface StudentRange {
  studentName: string;
  startPage: number;
  endPage: number;
}

export const identifyStudentRanges = async (base64Data: string, mimeType: string): Promise<StudentRange[]> => {
  if (!apiKey) throw new Error("API Key not found");

  const model = "gemini-2.5-flash";

  const responseSchema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        studentName: { type: Type.STRING, description: "Name of the student identified on the page" },
        startPage: { type: Type.NUMBER, description: "The first page number of this student's submission (1-indexed)" },
        endPage: { type: Type.NUMBER, description: "The last page number of this student's submission (1-indexed)" }
      },
      required: ["studentName", "startPage", "endPage"]
    }
  };

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data
            }
          },
          {
            text: `This PDF contains multiple student assessments concatenated together. 
            Identify the start and end page numbers for each distinct student submission. 
            
            Look for:
            1. Student names at the top of pages (e.g., "Student: John Doe" or "Name: ...").
            2. Page numbering sequences (e.g., "Page 1 of 5", "PG 1 of 5").
            3. Changes in handwriting or QR codes that signify a new test booklet.
            
            Return a JSON list of students with their start and end pages. 
            Ensure the page ranges are contiguous and cover the document if possible.
            Pages are 1-indexed.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    });

    const text = response.text;
    if (!text) return [];
    
    return JSON.parse(text);

  } catch (error) {
    console.error("Gemini Split Analysis Error:", error);
    throw error;
  }
};

export const gradeStudentSubmission = async (
  rubric: RubricItem[],
  studentBase64: string,
  mimeType: string
): Promise<AiGradingResult[]> => {
  if (!apiKey) throw new Error("API Key not found");
  
  const model = "gemini-2.5-flash";

  // Filter rubric to send relevant info
  const rubricContext = JSON.stringify(rubric.map(r => ({
    id: r.id,
    question: r.question,
    maxPoints: r.maxPoints,
    type: r.type,
    correctAnswer: r.correctAnswer, // Context for AI to compare
    criteria: r.criteria
  })));

  const responseSchema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        questionId: { type: Type.STRING, description: "The matching ID from the provided rubric" },
        score: { type: Type.NUMBER, description: "The score assigned to the student's answer" },
        comment: { type: Type.STRING, description: "A helpful feedback comment" },
        studentAnswer: { type: Type.STRING, description: "For MCQ: The specific letter/option selected by the student (e.g., 'A'). For FRQ: A short summary of their answer." }
      },
      required: ["questionId", "score", "comment"]
    }
  };

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: studentBase64
            }
          },
          {
            text: `You are an automated grading system. Here is the Rubric JSON: ${rubricContext}.
            
            Analyze the attached student submission pages. 
            
            For MCQ Questions:
            1. Locate the bubble sheet or the specific question number.
            2. Identify which letter was filled in or circled by the student.
            3. Compare it STRICTLY to the 'correctAnswer' in the rubric.
            4. If it matches, score = maxPoints. If not, score = 0.
            5. In 'studentAnswer', return just the letter (e.g. "B").
            
            For FRQ Questions:
            1. Evaluate the student's written response against the criteria.
            2. Assign a fair score.
            
            Return the results in the specified JSON format.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    });

    const text = response.text;
    if (!text) return [];
    
    return JSON.parse(text);

  } catch (error) {
    console.error("Gemini Grading Error:", error);
    throw error;
  }
};