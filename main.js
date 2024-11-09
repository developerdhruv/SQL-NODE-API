const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = 3042;
const dotenv = require('dotenv');
app.use(cors());
dotenv.config();

let pool;

async function initializeDB() {
    try {
        pool = await mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            connectionLimit: 10,
            waitForConnections: true,
            queueLimit: 0,
        });
        console.log('Database pool connected');
    } catch (err) {
        console.error('Database connection failed:', err);
        throw err;
    }
}

initializeDB().catch((err) => {
    console.error('Error initializing database:', err);
    process.exit(1);
});

// Fetch categories
app.get('/api/categories', async (req, res) => {
    try {
        const [results] = await pool.query('SELECT DISTINCT Categories FROM dataweb');
        const categories = results.map(row => row.Categories);
        res.json(categories);
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).send('Error fetching categories');
    }
});

// Fetch makes
app.get('/api/makes', async (req, res) => {
    const { term } = req.query;

    try {
        let query;
        const queryParams = [];

        if (term) {
            query = `
                SELECT DISTINCT Meta_cpr_make AS make
                FROM dataweb
                WHERE Meta_cpr_make LIKE ?
                  AND Meta_cpr_make IS NOT NULL
                ORDER BY 
                    LOCATE(?, Meta_cpr_make) ASC,
                    LENGTH(Meta_cpr_make) ASC
            `;
            queryParams.push(`%${term}%`, term);
        } else {
            query = `
                SELECT DISTINCT Meta_cpr_make AS make
                FROM dataweb
                WHERE Meta_cpr_make IS NOT NULL
                ORDER BY Meta_cpr_make ASC;
            `;
        }

        const [results] = await pool.query(query, queryParams);
        const makes = results.map(row => row.make);
        res.json(makes);
    } catch (err) {
        console.error('Error fetching makes:', err);
        res.status(500).send('Error fetching makes');
    }
});

// Fetch models
app.get('/api/models', async (req, res) => {
    const { make, term } = req.query;

    if (!make) {
        return res.status(400).send('Make parameter is required');
    }

    try {
        let query;
        const queryParams = [make];

        if (term) {
            query = `
                SELECT DISTINCT Meta_cpr_model AS model
                FROM dataweb
                WHERE Meta_cpr_make = ?
                  AND Meta_cpr_model LIKE ?
                  AND Meta_cpr_model IS NOT NULL
                ORDER BY LOCATE(?, Meta_cpr_model) ASC, LENGTH(Meta_cpr_model) ASC
            `;
            queryParams.push(`%${term}%`, term);
        } else {
            query = `
                SELECT DISTINCT Meta_cpr_model AS model
                FROM dataweb
                WHERE Meta_cpr_make = ?
                  AND Meta_cpr_model IS NOT NULL
                ORDER BY Meta_cpr_model ASC
            `;
        }

        const [results] = await pool.query(query, queryParams);
        let models = [];
        results.forEach(row => {
            const modelList = row.model.split(',');
            models = models.concat(modelList);
        });
        models = [...new Set(models)]
            .filter(model => model.trim() !== "")
            .sort();
        res.json(models);
    } catch (err) {
        console.error('Error fetching models:', err);
        res.status(500).send('Error fetching models');
    }
});

app.get('/api/years-range', async (req, res) => {
    const { make } = req.query;
    
    if (!make) {
        return res.status(400).send('Make parameter is required');
    }

    try {
        const query = `
            SELECT 
                MIN(Meta_year_start) as minYear,
                MAX(Meta_year_end) as maxYear
            FROM dataweb
            WHERE Meta_cpr_make = ?
              AND Meta_year_start IS NOT NULL
              AND Meta_year_end IS NOT NULL
        `;
        
        const [results] = await pool.query(query, [make]);
        res.json(results[0]);
    } catch (err) {
        console.error('Error fetching year range:', err);
        res.status(500).send('Error fetching year range');
    }
});

// Updated products endpoint with partial SKU search
app.get('/api/products', async (req, res) => {
    const { make, model, year, keyword, category, sku } = req.query;
    let query = 'SELECT * FROM dataweb WHERE 1=1';
    const queryParams = [];

    // Handle SKU/Part Number search first
    if (sku) {
        const skuWithoutPrefix = sku.replace(/^[A-Za-z]+/, ''); // Remove leading letters if any
        query += ` AND (
            SKU LIKE ? OR 
            SKU LIKE ? OR 
            SKU LIKE ? OR 
            SKU LIKE ?
        )`;
        // Add different variations of the SKU search
        queryParams.push(
            `%${sku}%`,                // Full SKU
            `%${skuWithoutPrefix}%`,   // SKU without prefix
            `${sku}%`,                 // Starting with SKU
            `${skuWithoutPrefix}%`     // Starting with SKU without prefix
        );
    }

    // Add other search conditions
    if (make) {
        query += ' AND Meta_cpr_make = ?';
        queryParams.push(make);
    }
    if (model) {
        query += ' AND Meta_cpr_model LIKE ?';
        queryParams.push(`%${model}%`);
    }
    if (year) {
        query += ' AND Meta_year_start <= ? AND Meta_year_end >= ?';
        queryParams.push(year, year);
    }
    if (keyword) {
        query += ' AND (Name LIKE ? OR Description LIKE ?)';
        queryParams.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (category) {
        query += ' AND Categories LIKE ?';
        queryParams.push(`%${category}%`);
    }

    try {
        // Add ORDER BY clause to prioritize exact matches
        if (sku) {
            query += ` ORDER BY 
                CASE 
                    WHEN SKU = ? THEN 1
                    WHEN SKU LIKE ? THEN 2
                    ELSE 3 
                END,
                LENGTH(SKU)`;
            queryParams.push(sku, `${sku}%`);
        }

        const [results] = await pool.query(query, queryParams);
        res.json(results);
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).send('Error fetching products');
    }
});

// Fetch a single product
app.get('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [[result]] = await pool.query('SELECT * FROM dataweb WHERE ID = ?', [id]);
        res.json(result);
    } catch (err) {
        console.error('Error fetching product:', err);
        res.status(500).send('Error fetching product');
    }
});

// Enhanced suggestions endpoint with SKU support
app.get('/api/suggestions', async (req, res) => {
    const { term } = req.query;
    if (!term) {
        return res.json([]);
    }

    try {
        const skuWithoutPrefix = term.replace(/^[A-Za-z]+/, '');
        const query = `
            SELECT DISTINCT 
                CASE 
                    WHEN SKU LIKE ? THEN SKU
                    WHEN Name LIKE ? THEN Name
                    ELSE NULL 
                END as suggestion
            FROM dataweb 
            WHERE 
                SKU LIKE ? OR 
                SKU LIKE ? OR 
                Name LIKE ? OR 
                Meta_cpr_make LIKE ? OR 
                Meta_cpr_model LIKE ?
            ORDER BY 
                CASE 
                    WHEN SKU = ? THEN 1
                    WHEN SKU LIKE ? THEN 2
                    ELSE 3 
                END,
                LENGTH(suggestion)
            LIMIT 10
        `;
        
        const searchTerm = `%${term}%`;
        const skuSearchTerm = `%${skuWithoutPrefix}%`;
        
        const [results] = await pool.query(query, [
            searchTerm,
            searchTerm,
            searchTerm,
            skuSearchTerm,
            searchTerm,
            searchTerm,
            searchTerm,
            term,
            `${term}%`
        ]);
        
        res.json(results
            .map(row => row.suggestion)
            .filter(suggestion => suggestion !== null)
        );
    } catch (err) {
        console.error('Error fetching suggestions:', err);
        res.status(500).send('Error fetching suggestions');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});