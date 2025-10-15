const triviaForm = document.getElementById('triviaForm');
const questionsContainer = document.getElementById('questionsContainer');
const triviaSubmit = document.getElementById('triviaSubmit');

triviaSubmit.addEventListener('onClick', async (event) => {
    event.preventDefault();

    const category = document.getElementById('category').value;
    const difficulty = document.getElementById('difficulty').value;
    
    try {
        const response = await fetch(`https://opentdb.com/api.php?amount=5&category=${category}&difficulty=${difficulty}&type=multiple`);
        const data = await response.json();
        displayQuestions(data.results);
    } catch (error) {
        console.error('Error fetching trivia questions:', error);
    }
})