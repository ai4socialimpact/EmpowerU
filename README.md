# EmpowerU / College Compass

A Next.js app for helping students explore college resources, chat with an AI mentor, and generate college recommendations.

## Tech Stack

- Next.js 15
- React 18
- TypeScript
- Tailwind CSS
- Firebase Auth
- Cloud Firestore
- Firebase Functions
- Genkit
- Gemini API
- Algolia, used by Firebase Functions for glossary indexing


## Required variables
- NEXT_PUBLIC_FIREBASE_API_KEY=
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
- NEXT_PUBLIC_FIREBASE_PROJECT_ID=
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
- NEXT_PUBLIC_FIREBASE_APP_ID=
- GEMINI_API_KEY=
- OTEL_SDK_DISABLED=true


## Install
- Install dependencies with npm install
- npm run dev to see the local server

## Firebase 

- Firebase project ID: `top-cubist-449422-f4`
-Firebase console to see the storage and other information


- Only users that have admin can see the admin chats and admin feedback.  (basically all of the chats and feedback that was given.)
- To be given admin, go to firebase console and then firestore. Then click on the admins collection and add the person
- For storage, it is currently using cloud firestore. 
- Definitely review security rules and admin access before production. 
- Firestore security rules are in firestore.rules
- Don't commit .env.local    (Make sure it's in gitignore so you don't upload all of your api keys.)