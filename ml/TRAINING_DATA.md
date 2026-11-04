# Data for training the project risk model

The current trainer uses generated data when `historical_tasks.csv` is absent. Its accuracy score measures agreement with the simulator's generated labels; it does not establish accuracy on real projects.

## Prepare historical examples

Copy `historical_tasks_template.csv` to `historical_tasks.csv` and add one row per task snapshot. Each feature must describe what was known at the time the risk would have been predicted. Put the retrospective outcome label in `risk_level` (`low`, `medium`, or `high`). Do not use a previous prediction from this model as the label; that would train it to repeat its own predictions.

Features:

- `duration_days`: estimated task duration in days.
- `progress`: percent complete, from 0 to 100.
- `days_remaining`: days until the due date; negative means overdue.
- `importance`: low = 0, medium = 1, high = 2.
- `dependency_count`, `unfinished_dependency_count`: total prerequisites and those unfinished at the snapshot.
- `assignee_workload`: number of tasks assigned to the person at the snapshot.
- `team_size`: number of people on the project team.
- `project_complexity`: project complexity score, 1 to 40.
- `manager_experience`: manager experience score, 0 to 20.
- `historical_risk_score`: prior project risk score, 0 to 100.
- `budget_per_task`: project budget divided by task count, in the same unit for every row.
- `risk_level`: retrospective outcome category (`low`, `medium`, or `high`), using criteria agreed by your organization.

The trainer currently requires at least 200 complete rows. Include examples from all three outcome categories. More representative, correctly labeled history is needed for dependable evaluation. Keep related snapshots from the same project together when judging results; randomly splitting individual snapshots can make evaluation look better than performance on new projects.

After preparing the data, place it beside these scripts as `historical_tasks.csv` and run `python export_client_model.py`. The exporter records whether the model used historical or synthetic data in `modelInfo.json` and in the client model metadata. Commit the generated `frontend/public/models/risk-model.json` and `backend/src/services/modelInfo.json`; do not deploy the CSV or Python code.
