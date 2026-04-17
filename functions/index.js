const functions = require("firebase-functions");
const axios = require("axios");
const algoliasearch = require("algoliasearch");
const admin = require("firebase-admin");

admin.initializeApp();

// This line is updated to get the key from the environment
const OPENAI_API_KEY = functions.config().openai.key;
const ALGOLIA_APP_ID = functions.config().algolia.app_id;
const ALGOLIA_API_KEY = functions.config().algolia.api_key;
const ALGOLIA_INDEX_NAME = "glossary";
const FIREBASE_PROJECT_ID = "top-cubist-449422-f4";
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  `https://${FIREBASE_PROJECT_ID}.web.app`,
  `https://${FIREBASE_PROJECT_ID}.firebaseapp.com`,
];

function getAllowedOrigins() {
  const configuredOrigins = functions.config().app?.allowed_origins;

  if (!configuredOrigins) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function applyCors(req, res) {
  const origin = req.get("origin");
  const allowedOrigins = getAllowedOrigins();

  if (!origin) {
    return true;
  }

  if (!allowedOrigins.includes(origin)) {
    res.status(403).send("Origin not allowed.");
    return false;
  }

  res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return true;
}

const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);
const index = client.initIndex(ALGOLIA_INDEX_NAME);

exports.chatWithOpenAI = functions.https.onRequest(async (req, res) => {
  if (!applyCors(req, res)) {
    return;
  }

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed.");
    return;
  }
  
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).send("Missing 'message' in request body.");
  }

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo", // You can use "gpt-4" if you have access
        messages: [{ role: "user", content: userMessage }],
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const reply = response.data.choices[0].message.content;
    res.status(200).send({ reply });
  } catch (error) {
    console.error("OpenAI API error:", error.response?.data || error.message);
    res.status(500).send("Failed to get response from OpenAI.");
  }
});

exports.onGlossaryDocWritten = functions.firestore
  .document("glossary/{glossaryId}")
  .onWrite(async (change, context) => {
    const docId = context.params.glossaryId;
    const afterData = change.after.data();

    if (change.after.exists) {
      // Document was created or updated
      const record = {
        objectID: docId,
        term: afterData.term,
        simple_definition: afterData.simple_definition,
      };

      try {
        await index.saveObject(record);
        console.log(`Indexed document ${docId} in Algolia.`);
      } catch (error) {
        console.error(`Error indexing document ${docId} in Algolia:`, error);
      }
    } else {
      // Document was deleted
      try {
        await index.deleteObject(docId);
        console.log(`Deleted document ${docId} from Algolia.`);
      } catch (error) {
        console.error(
          `Error deleting document ${docId} from Algolia:`,
          error
        );
      }
    }
  });

exports.populateGlossary = functions.https.onRequest(async (req, res) => {
  const glossaryData = [
    {
      term: "Expected Family Contribution",
      acronym: "EFC",
      simple_definition: "A measure of your family's financial strength.",
      detailed_explanation:
        "The Expected Family Contribution (EFC) is a number used by colleges and universities to determine how much financial aid you are eligible to receive. It is calculated using a formula established by law and considers your family's income, assets, and benefits. The EFC is not the amount of money your family will have to pay for college, but rather an index that colleges use to determine your financial need.",
      category: "Financial Aid",
    },
    {
      term: "Free Application for Federal Student Aid",
      acronym: "FAFSA",
      simple_definition:
        "The form you fill out to apply for federal financial aid.",
      detailed_explanation:
        "The Free Application for Federal Student Aid (FAFSA) is the official form that students and their families must complete to apply for federal, state, and institutional financial aid. The FAFSA is used to determine your eligibility for grants, scholarships, work-study programs, and federal student loans.",
      category: "Financial Aid",
    },
    {
      term: "College Scholarship Service Profile",
      acronym: "CSS Profile",
      simple_definition:
        "An online application for non-federal student financial aid.",
      detailed_explanation:
        "The CSS Profile is an online application that many private colleges and universities use to award their own institutional financial aid. It is more detailed than the FAFSA and collects information about your family's income, assets, and expenses. The CSS Profile is not free to submit and has a fee for each college you send it to.",
      category: "Financial Aid",
    },
    {
      term: "Grant",
      acronym: "",
      simple_definition:
        "Free money for college that you don't have to pay back.",
      detailed_explanation:
        "A grant is a form of financial aid that does not have to be repaid. Grants are typically awarded based on financial need, but some are based on merit or other criteria. Grants can come from the federal government, state governments, colleges and universities, and private organizations.",
      category: "Financial Aid",
    },
    {
      term: "Subsidized Loan",
      acronym: "",
      simple_definition:
        "A loan for undergraduate students with financial need where the government pays the interest while you're in school.",
      detailed_explanation:
        "A subsidized loan is a type of federal student loan for which the U.S. Department of Education pays the interest while you are in school at least half-time, for the first six months after you leave school (referred to as a grace period), and during a period of deferment (a postponement of loan payments). Subsidized loans are awarded based on financial need.",
      category: "Financial Aid",
    },
    {
      term: "Unsubsidized Loan",
      acronym: "",
      simple_definition:
        "A loan for undergraduate and graduate students that is not based on financial need.",
      detailed_explanation:
        "An unsubsidized loan is a type of federal student loan for which you are responsible for paying the interest during all periods. If you choose not to pay the interest while you are in school and during grace periods and deferment or forbearance periods, your interest will accrue (accumulate) and be capitalized (that is, your interest will be added to the principal amount of your loan).",
      category: "Financial Aid",
    },
  ];

  const glossaryCollection = admin.firestore().collection("glossary");

  try {
    const batch = admin.firestore().batch();
    glossaryData.forEach((doc) => {
      const docRef = glossaryCollection.doc();
      batch.set(docRef, doc);
    });
    await batch.commit();
    res.status(200).send("Glossary populated successfully!");
  } catch (error) {
    console.error("Error populating glossary:", error);
    res.status(500).send("Error populating glossary.");
  }
});
