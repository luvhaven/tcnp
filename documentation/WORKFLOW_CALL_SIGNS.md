# Workflow & Call-Signs

The heart of the TCNP Journey Management System is its standardized workflow, driven by military-grade call-signs. These call-signs ensure clear communication between the field (Delta Oscars) and the Command Center.

## 📡 The Call-Sign Language

Every major phase of a journey is represented by a specific call-sign. Executing a call-sign updates the journey status and logs an immutable **Journey Event**.

### Core Movement Call-Signs

| Call-Sign | Trigger Event | Resulting Status |
| :--- | :--- | :--- |
| **First Course** | Principal departs from the Nest (Hotel) for the Theatre (Venue). | `enroute_to_theatre` |
| **Chapman** | Principal arrives at the Theatre gate/entrance. | `at_theatre` |
| **Dessert** | Principal departs from the Theatre to return to the Nest. | `departing_theatre` |
| **Cocktail** | General indicator that the principal is currently in transit. | `enroute` |

### Traffic & Advisory Call-Signs

-   **Blue Cocktail:** Indicates **Mild Traffic**. Advisory only.
-   **Red Cocktail:** Indicates **Heavy Traffic**. Used to alert the command center of potential delays.
-   **Re-order:** Indicates a **Route Change** has been initiated (e.g., due to roadblocks or security concerns).

---

## 🚨 Emergency: Broken Arrow

**Broken Arrow** is the system's highest-priority call-sign. It is triggered only in cases of extreme emergency or distress.

### What happens when Broken Arrow is triggered:
1.  **UI Alert:** The Command Center dashboard flashes Red and triggers an audible alert.
2.  **Instant Notifications:** SMS and Push notifications are sent to all Super Admins, Captains, and the Head of Command Center.
3.  **Telemetry Lock:** The system increases GPS polling frequency for that specific Cheetah (vehicle).
4.  **Incident Creation:** An automatic "Critical Incident" report is generated with the last known coordinates.

---

## 🔄 The Journey Lifecycle

A typical journey follows this progression:

1.  **Planned:** Journey created by a Captain/Admin; Papa and Cheetah assigned.
2.  **Scheduled:** Delta Oscar assigned; ready for takeoff.
3.  **First Course:** Movement starts.
4.  **Chapman:** Principal arrives at venue.
5.  **Dessert:** Principal leaves venue.
6.  **At Nest:** Principal safely returns home.
7.  **Completed:** Journey closed by the Command Center.

---

## 🛠 Operational Integrity (The "DO" Rule)

To ensure high-fidelity data, the system enforces the following rules at the database level:
-   **Only the assigned Delta Oscar** (or an Admin) can trigger call-signs for a specific journey.
-   **Timestamps** are captured by the server at the moment of execution, preventing retrospective "data fudging."
-   **Geofencing:** (Planned) The system optionally verifies that the user's GPS coordinates match the expected location (e.g., Nest or Theatre) when triggering call-signs.

---
> [!TIP]
> Call-sign updates are the primary data source for the **Command Center Velocity View**, which calculates travel times and ETAs for future events.
