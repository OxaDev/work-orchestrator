import { Loader } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router";

import { api, unwrap } from "../../api/client";
import { NotFoundPage } from "../placeholder/NotFoundPage";

/** /subjects/:id — wikilink target: a subject lives on its mission page or its scope's page. */
export function SubjectRedirect() {
  const { subjectId = "" } = useParams();
  const subject = useQuery({
    queryKey: ["subjects", "one", subjectId],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/subjects/{subject_id}", { params: { path: { subject_id: subjectId } } }),
      ),
  });
  if (subject.isPending) return <Loader size="sm" />;
  if (!subject.data) return <NotFoundPage />;
  const target = subject.data.mission_id
    ? `/missions/${subject.data.mission_id}?tab=subjects`
    : `/agenda/subjects?scope=${subject.data.scope}`;
  return <Navigate to={target} replace />;
}
