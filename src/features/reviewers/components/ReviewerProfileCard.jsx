function ReviewerProfileCard({ reviewer }) {
  return (
    <article className="card">
      <h4>{reviewer.name}</h4>
      <p>{reviewer.specialty}</p>
      <p>{reviewer.institution}</p>
      <p>Languages: {reviewer.languages.join(", ")}</p>
      <p>Availability: {reviewer.availability}</p>
      <p>Review count: {reviewer.reviewCount}</p>
      <p>Average turnaround time: {reviewer.avgTurnaround}</p>
    </article>
  );
}

export default ReviewerProfileCard;
