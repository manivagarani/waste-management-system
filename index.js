"use strict";
// src/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveIssueByAdmin = exports.reportIssue = exports.submitRating = exports.completeCleaningTask = exports.acceptCleaningTask = exports.completeDustbinRequest = exports.approveDustbinRequest = exports.submitComplaint = exports.submitDustbinRequest = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Initialize the Firebase App (Required to connect to the database)
admin.initializeApp();
const db = admin.firestore();
// --- HELPER FUNCTION ---
// Helper to fetch the role of a user based on their UID.
// This is used repeatedly for server-side permission checks.
const getUserRole = async (uid) => {
    var _a;
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
        throw new functions.https.HttpsError("not-found", "User not found in database.");
    }
    return (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.role;
};
// ==========================================
// 1. SUBMIT DUSTBIN REQUEST (Citizen)
// ==========================================
exports.submitDustbinRequest = functions.https.onCall(async (data, context) => {
    var _a, _b;
    // Step 1: Check if the user is authenticated (logged in)
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Please login first.");
    }
    const citizenId = context.auth.uid;
    const citizenDoc = await db.collection("users").doc(citizenId).get();
    // Step 2: Verify that the user role is 'citizen'
    if (!citizenDoc.exists || ((_a = citizenDoc.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'citizen') {
        throw new functions.https.HttpsError("permission-denied", "Only citizens can make requests.");
    }
    // Step 3: Find a 'Village Staff' member in the same village as the request
    const villageStaffQuery = await db.collection("users")
        .where("village", "==", data.village)
        .where("role", "==", "village_staff")
        .limit(1)
        .get();
    if (villageStaffQuery.empty) {
        throw new functions.https.HttpsError("not-found", "No staff found in this village.");
    }
    // Step 4: Get the Staff ID for assignment
    const assignedVillageStaffId = villageStaffQuery.docs[0].id;
    // Step 5: Prepare the request object
    const newRequest = Object.assign(Object.assign({}, data), { citizenId, citizenName: (_b = citizenDoc.data()) === null || _b === void 0 ? void 0 : _b.name, status: "ASSIGNED", // Initial status
        assignedVillageStaffId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    // Step 6: Save to Firestore database
    await db.collection("dustbin_requests").add(newRequest);
    return { success: true, message: "Request sent successfully." };
});
// ==========================================
// 2. SUBMIT COMPLAINT (Citizen)
// ==========================================
exports.submitComplaint = functions.https.onCall(async (data, context) => {
    // Step 1: Authentication Check
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Please login first.");
    }
    const citizenId = context.auth.uid;
    // Step 2: Automatically find available 'Cleaning Staff'
    // (In the future, we can add logic to find staff based on specific location)
    const cleaningStaffQuery = await db.collection("users")
        .where("role", "==", "cleaning_staff")
        .limit(1)
        .get();
    if (cleaningStaffQuery.empty) {
        throw new functions.https.HttpsError("not-found", "No cleaning staff available right now.");
    }
    const assignedCleaningStaffId = cleaningStaffQuery.docs[0].id;
    // Step 3: Create and Save the Complaint
    const newComplaint = Object.assign(Object.assign({}, data), { citizenId, status: "ASSIGNED", assignedCleaningStaffId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection("complaints").add(newComplaint);
    return { success: true, message: "Complaint registered successfully." };
});
// ==========================================
// 3. APPROVE REQUEST (Village Staff)
// ==========================================
exports.approveDustbinRequest = functions.https.onCall(async (data, context) => {
    // Permission Check: Ensure the caller is a Village Staff member
    if (!context.auth || await getUserRole(context.auth.uid) !== 'village_staff') {
        throw new functions.https.HttpsError("permission-denied", "Only village staff can approve.");
    }
    // Update status to IN_PROGRESS
    await db.collection("dustbin_requests").doc(data.requestId).update({ status: "IN_PROGRESS" });
    return { success: true, message: "Request Approved." };
});
// ==========================================
// 4. COMPLETE REQUEST (Village Staff)
// ==========================================
exports.completeDustbinRequest = functions.https.onCall(async (data, context) => {
    if (!context.auth || await getUserRole(context.auth.uid) !== 'village_staff') {
        throw new functions.https.HttpsError("permission-denied", "Only village staff can complete requests.");
    }
    // Update status to COMPLETED and record the completion time
    await db.collection("dustbin_requests").doc(data.requestId).update({
        status: "COMPLETED",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, message: "Request Completed." };
});
// ==========================================
// 5. ACCEPT CLEANING TASK (Cleaning Staff)
// ==========================================
exports.acceptCleaningTask = functions.https.onCall(async (data, context) => {
    if (!context.auth || await getUserRole(context.auth.uid) !== 'cleaning_staff') {
        throw new functions.https.HttpsError("permission-denied", "Only cleaning staff can accept tasks.");
    }
    await db.collection("complaints").doc(data.complaintId).update({ status: "IN_PROGRESS" });
    return { success: true, message: "Task Accepted." };
});
// ==========================================
// 6. COMPLETE CLEANING TASK (Cleaning Staff)
// ==========================================
exports.completeCleaningTask = functions.https.onCall(async (data, context) => {
    if (!context.auth || await getUserRole(context.auth.uid) !== 'cleaning_staff') {
        throw new functions.https.HttpsError("permission-denied", "Only cleaning staff can complete tasks.");
    }
    await db.collection("complaints").doc(data.complaintId).update({
        status: "COMPLETED",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, message: "Task Completed." };
});
// ==========================================
// 7. SUBMIT RATING (Citizen)
// ==========================================
exports.submitRating = functions.https.onCall(async (data, context) => {
    if (!context.auth || await getUserRole(context.auth.uid) !== 'citizen') {
        throw new functions.https.HttpsError("permission-denied", "Only citizens can rate.");
    }
    const newRating = Object.assign(Object.assign({}, data), { citizenId: context.auth.uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection("ratings").add(newRating);
    return { success: true, message: "Thanks for feedback!" };
});
// ==========================================
// 8. REPORT ISSUE (Citizen)
// ==========================================
exports.reportIssue = functions.https.onCall(async (data, context) => {
    if (!context.auth || await getUserRole(context.auth.uid) !== 'citizen') {
        throw new functions.https.HttpsError("permission-denied", "Only citizens can report issues.");
    }
    // Step 1: Create a new document in the 'issues' collection
    await db.collection("issues").add(Object.assign(Object.assign({}, data), { status: "OPEN", createdAt: admin.firestore.FieldValue.serverTimestamp() }));
    // Step 2: Update the status of the original task (Dustbin or Complaint) to 'ISSUE_REPORTED'
    const collectionName = data.taskType === 'dustbin' ? 'dustbin_requests' : 'complaints';
    await db.collection(collectionName).doc(data.taskId).update({ status: "ISSUE_REPORTED" });
    return { success: true, message: "Issue reported to Admin." };
});
// ==========================================
// 9. RESOLVE ISSUE (Admin)
// ==========================================
exports.resolveIssueByAdmin = functions.https.onCall(async (data, context) => {
    // Step 1: Verify that the user is an Admin
    if (!context.auth || await getUserRole(context.auth.uid) !== 'admin') {
        throw new functions.https.HttpsError("permission-denied", "Only Admins allowed.");
    }
    // Step 2: Mark the issue as RESOLVED
    await db.collection("issues").doc(data.issueId).update({
        status: "RESOLVED",
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, message: "Issue Resolved." };
});
//# sourceMappingURL=index.js.map