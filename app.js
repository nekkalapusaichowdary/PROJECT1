// =====================================================
//  ChefAI – Frontend Only (No Backend Required)
//  Works by opening index.html directly in browser
// =====================================================

const GEMINI_API_KEY = 'AIzaSyCclc-OiN-4nDLT8FHtpW9fIwG0tjTW4S0';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=...`;

let ingredients = [];
let savedRecipes = [];
let lastGeneratedRecipe = null;

document.addEventListener('DOMContentLoaded', () => {
  initIngredients();
  document.getElementById('generateBtn').addEventListener('click', generateRecipe);
});

// =====================================================
//  INGREDIENT MANAGEMENT
// =====================================================
function initIngredients() {
  const input = document.getElementById('ingredientInput');
  const addBtn = document.getElementById('addIngredientBtn');

  addBtn.addEventListener('click', () => {
    addIngredient(input.value.trim());
    input.value = '';
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      addIngredient(input.value.trim());
      input.value = '';
    }
  });

  document.querySelectorAll('.quick-tag').forEach(tag => {
    tag.addEventListener('click', () => addIngredient(tag.dataset.val));
  });
}

function addIngredient(value) {
  if (!value || ingredients.includes(value)) return;
  ingredients.push(value);
  renderIngredientTags();
}

function removeIngredient(value) {
  ingredients = ingredients.filter(i => i !== value);
  renderIngredientTags();
}

function renderIngredientTags() {
  const container = document.getElementById('ingredientTags');
  container.innerHTML = '';
  ingredients.forEach(ing => {
    const tag = document.createElement('span');
    tag.className = 'ingredient-tag';
    tag.innerHTML = `${ing} <button onclick="removeIngredient('${ing}')" title="Remove">✕</button>`;
    container.appendChild(tag);
  });
}

// =====================================================
//  COLLECT PREFERENCES
// =====================================================
function collectPreferences() {
  const diet     = [...document.querySelectorAll('input[name="diet"]:checked')].map(e => e.value);
  const allergies= [...document.querySelectorAll('input[name="allergy"]:checked')].map(e => e.value);
  const goal     = document.querySelector('input[name="goal"]:checked')?.value || 'Balanced';
  const cuisine  = document.getElementById('cuisineSelect').value;
  const mealType = document.getElementById('mealTypeSelect').value;
  const cookTime = document.getElementById('cookTimeSelect').value;
  const servings = document.getElementById('servingsSelect').value;
  const skillLevel = ['Beginner','Intermediate','Advanced'][parseInt(document.getElementById('skillSlider').value)-1];
  return { diet, allergies, goal, cuisine, mealType, cookTime, servings, skillLevel };
}

// =====================================================
//  BUILD PROMPT
// =====================================================
function buildPrompt(ings, prefs) {
  return `You are ChefAI, an expert culinary AI. Create a unique personalized recipe.

USER INPUTS:
- Ingredients: ${ings.join(', ')}
- Dietary Preferences: ${prefs.diet.length ? prefs.diet.join(', ') : 'None'}
- Allergies/Avoid: ${prefs.allergies.length ? prefs.allergies.join(', ') : 'None'}
- Cuisine: ${prefs.cuisine || 'Any'}
- Meal Type: ${prefs.mealType || 'Any'}
- Max Cook Time: ${prefs.cookTime || 'No limit'}
- Nutritional Goal: ${prefs.goal}
- Skill Level: ${prefs.skillLevel}
- Servings: ${prefs.servings}

CRITICAL: Respond ONLY with a single valid JSON object. No markdown, no backticks, no extra text. Pure JSON only.

{
  "title": "Recipe Name",
  "description": "Short enticing description",
  "cuisine": "Cuisine",
  "mealType": "Meal type",
  "prepTime": "10 min",
  "cookTime": "20 min",
  "totalTime": "30 min",
  "servings": ${prefs.servings},
  "difficulty": "${prefs.skillLevel}",
  "dietBadges": ["badge1"],
  "ingredients": ["1 cup ingredient", "2 tbsp ingredient"],
  "steps": ["Step one.", "Step two."],
  "nutrition": {
    "calories": "350 kcal",
    "protein": "25g",
    "carbs": "30g",
    "fat": "12g",
    "fiber": "5g",
    "sugar": "4g"
  },
  "tips": "Chef tips here."
}`;
}

// =====================================================
//  GENERATE RECIPE — DIRECT GEMINI CALL
// =====================================================
async function generateRecipe() {
  if (ingredients.length === 0) {
    showToast('⚠️ Please add at least one ingredient!');
    return;
  }

  const btn     = document.getElementById('generateBtn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = document.getElementById('btnLoader');
  const btnIcon = btn.querySelector('.btn-icon');

  btn.disabled = true;
  btnText.textContent = 'Crafting your recipe...';
  btnLoader.style.display = 'inline';
  btnIcon.style.display = 'none';
  showLoadingPlaceholder();

  try {
    const prefs  = collectPreferences();
    const prompt = buildPrompt(ingredients, prefs);

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg = errData?.error?.message || `Error ${response.status}`;
      if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('API quota exceeded! Please get a new key at aistudio.google.com');
      }
      throw new Error(msg);
    }

    const data    = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('Empty response from Gemini');

    const recipe = parseJSON(rawText);
    if (!recipe)  throw new Error('Could not parse recipe data');

    lastGeneratedRecipe = recipe;
    renderRecipe(recipe);
    showToast('✅ Recipe generated!');

  } catch (err) {
    console.error('Error:', err);
    showToast(`❌ ${err.message}`);
    resetOutputPanel();
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Generate My Recipe';
    btnLoader.style.display = 'none';
    btnIcon.style.display = 'inline';
  }
}

// =====================================================
//  JSON PARSER (3-layer fallback)
// =====================================================
function parseJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  try { return JSON.parse(text.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim()); } catch (_) {}
  try {
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s !== -1 && e !== -1) return JSON.parse(text.slice(s, e+1));
  } catch (_) {}
  return null;
}

// =====================================================
//  LOADING SHIMMER
// =====================================================
function showLoadingPlaceholder() {
  document.getElementById('outputPlaceholder').style.display = 'none';
  const card = document.getElementById('recipeCard');
  card.style.display = 'block';
  card.innerHTML = `
    <div style="padding:32px">
      <div style="display:flex;gap:8px;margin-bottom:20px">
        <div class="shimmer" style="width:80px;height:24px;border-radius:100px"></div>
        <div class="shimmer" style="width:110px;height:24px;border-radius:100px"></div>
      </div>
      <div class="shimmer" style="width:65%;height:32px;margin-bottom:12px"></div>
      <div class="shimmer" style="width:90%;height:16px;margin-bottom:6px"></div>
      <div class="shimmer" style="width:70%;height:16px;margin-bottom:24px"></div>
      <div class="shimmer" style="width:40%;height:14px;margin-bottom:12px"></div>
      <div class="shimmer" style="height:14px;margin-bottom:6px"></div>
      <div class="shimmer" style="height:14px;margin-bottom:6px"></div>
      <div class="shimmer" style="width:80%;height:14px;margin-bottom:24px"></div>
      <div class="shimmer" style="height:50px;margin-bottom:8px"></div>
      <div class="shimmer" style="height:50px;margin-bottom:8px"></div>
      <div class="shimmer" style="height:50px"></div>
    </div>`;
}

function resetOutputPanel() {
  restoreRecipeCardHTML();
  document.getElementById('recipeCard').style.display = 'none';
  document.getElementById('outputPlaceholder').style.display = 'flex';
}

// =====================================================
//  RESTORE CARD STRUCTURE
// =====================================================
function restoreRecipeCardHTML() {
  document.getElementById('recipeCard').innerHTML = `
    <div class="recipe-header">
      <div class="recipe-badges" id="recipeBadges"></div>
      <h3 class="recipe-title" id="recipeTitle"></h3>
      <p class="recipe-desc" id="recipeDesc"></p>
      <div class="recipe-meta" id="recipeMeta"></div>
    </div>
    <div class="recipe-body">
      <div class="recipe-section">
        <h4>🧂 Ingredients</h4>
        <ul class="ingredient-list" id="recipeIngredients"></ul>
      </div>
      <div class="recipe-section">
        <h4>📋 Instructions</h4>
        <ol class="steps-list" id="recipeSteps"></ol>
      </div>
      <div class="recipe-section nutrition-section">
        <h4>📊 Nutrition Estimate (per serving)</h4>
        <div class="nutrition-grid" id="nutritionGrid"></div>
      </div>
      <div class="recipe-section">
        <h4>💡 Chef's Tips</h4>
        <div class="tips-box" id="recipeTips"></div>
      </div>
    </div>
    <div class="recipe-footer">
      <button class="action-btn" id="regenerateBtn">🔄 Regenerate</button>
      <button class="action-btn" id="saveBtn">💾 Save Recipe</button>
      <button class="action-btn" id="printBtn">🖨️ Print</button>
    </div>`;

  document.getElementById('regenerateBtn').addEventListener('click', generateRecipe);
  document.getElementById('saveBtn').addEventListener('click', saveCurrentRecipe);
  document.getElementById('printBtn').addEventListener('click', () => window.print());
}

// =====================================================
//  RENDER RECIPE
// =====================================================
function renderRecipe(recipe) {
  document.getElementById('outputPlaceholder').style.display = 'none';
  const card = document.getElementById('recipeCard');
  card.style.display = 'block';
  restoreRecipeCardHTML();

  document.getElementById('recipeBadges').innerHTML =
    (recipe.dietBadges||[]).map(b=>`<span class="rbadge">${b}</span>`).join('');
  document.getElementById('recipeTitle').textContent = recipe.title || 'Your Recipe';
  document.getElementById('recipeDesc').textContent  = recipe.description || '';
  document.getElementById('recipeMeta').innerHTML = `
    <span class="meta-item">⏱ Prep: ${recipe.prepTime||'–'}</span>
    <span class="meta-item">🔥 Cook: ${recipe.cookTime||'–'}</span>
    <span class="meta-item">⏲ Total: ${recipe.totalTime||'–'}</span>
    <span class="meta-item">👥 Serves: ${recipe.servings||'–'}</span>
    <span class="meta-item">👨‍🍳 ${recipe.difficulty||'–'}</span>
    <span class="meta-item">🌍 ${recipe.cuisine||'–'}</span>`;
  document.getElementById('recipeIngredients').innerHTML =
    (recipe.ingredients||[]).map(i=>`<li>${i}</li>`).join('');
  document.getElementById('recipeSteps').innerHTML =
    (recipe.steps||[]).map(s=>`<li>${s}</li>`).join('');

  const nut = recipe.nutrition || {};
  document.getElementById('nutritionGrid').innerHTML =
    [['calories','Calories'],['protein','Protein'],['carbs','Carbs'],
     ['fat','Fat'],['fiber','Fiber'],['sugar','Sugar']]
    .map(([k,l])=>`
      <div class="nut-item">
        <div class="nut-value">${nut[k]||'–'}</div>
        <div class="nut-label">${l}</div>
      </div>`).join('');

  document.getElementById('recipeTips').textContent = recipe.tips || 'Enjoy your meal!';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// =====================================================
//  SAVE RECIPES
// =====================================================
function saveCurrentRecipe() {
  if (!lastGeneratedRecipe) { showToast('⚠️ No recipe to save!'); return; }
  if (savedRecipes.find(r => r.title === lastGeneratedRecipe.title)) {
    showToast('📌 Already saved!'); return;
  }
  savedRecipes.push({ ...lastGeneratedRecipe, savedAt: new Date().toLocaleDateString() });
  renderSaved();
  showToast('💾 Saved to your cookbook!');
}

function renderSaved() {
  const section = document.getElementById('saved');
  const grid    = document.getElementById('savedGrid');
  if (!savedRecipes.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  grid.innerHTML = savedRecipes.map((r,i)=>`
    <div class="saved-card card" onclick="viewSaved(${i})">
      <h5>${r.title}</h5>
      <p>${r.description}</p>
      <p style="margin-top:8px;font-size:0.75rem;color:#c97b2e">
        🕒 ${r.savedAt} · ⏱ ${r.totalTime} · 👥 ${r.servings} servings
      </p>
    </div>`).join('');
}

function viewSaved(index) {
  const recipe = savedRecipes[index];
  if (!recipe) return;
  lastGeneratedRecipe = recipe;
  renderRecipe(recipe);
  document.getElementById('generator').scrollIntoView({ behavior: 'smooth' });
}

// =====================================================
//  LOAD EXAMPLE
// =====================================================
function loadExample(btn) {
  const card = btn.closest('.example-card');
  ingredients = [];
  card.dataset.ingredients.split(',').forEach(i => addIngredient(i.trim()));
  const dietList = card.dataset.diet.split(',');
  document.querySelectorAll('input[name="diet"]').forEach(cb => cb.checked = dietList.includes(cb.value));
  document.getElementById('cuisineSelect').value = card.dataset.cuisine || '';
  document.querySelectorAll('input[name="goal"]').forEach(r => r.checked = r.value === card.dataset.goal);
  document.getElementById('generator').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => generateRecipe(), 700);
}

// =====================================================
//  TOAST
// =====================================================
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}