import OpenAI from "openai";
import "dotenv/config";

const apiKey = process.env.DEEPSEEK_API_KEY;

if (!apiKey) {
  throw new Error(
    "DEEPSEEK_API_KEY is missing. Add it to blog-agent/.env"
  );
}

export const deepseek = new OpenAI({
  apiKey,
  baseURL: "https://api.deepseek.com"
});