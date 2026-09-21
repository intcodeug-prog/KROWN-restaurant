import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Edit3, Image as ImageIcon, Loader2, Trash2, X, ChevronDown, Check } from 'lucide-react';
import { vibrate, getCategoryIcon } from '@/lib/utils';
import { formatUGX } from '@/lib/mockData';
import { dataStore } from '@/lib/dataStore';
import { api } from '@/lib/neon-client';

export default function ManagerMenu({ products, user, branchId }: { products: any[], user: any, branchId?: string }) {
  const [search, setSearch] = useState('');
  const [isEditing, setIsEditing] = useState<any | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);

  // Searchable Category Dropdown State
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [catSearchText, setCatSearchText] = useState('');

  // Compute current manager's branch scope (overridden by admin's branch selector)
  const activeStaff = dataStore.getStaff().find(s => s.email === user?.email);
  const managerBranchId = branchId && branchId !== 'all'
    ? branchId
    : (user?.assignedBranchId || activeStaff?.assignedBranchId || (activeStaff?.role === 'Super Admin' ? undefined : activeStaff?.branch));

  const [displayProducts, setDisplayProducts] = useState<any[]>(() => dataStore.getProducts(managerBranchId));
  const [recipe, setRecipe] = useState<{ ingredientId: string; quantityPerUnit: number }[]>([]);
  const [addOns, setAddOns] = useState<{ id: string; name: string; priceUGX: string }[]>([]);

  const [showCatsModal, setShowCatsModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [customCats, setCustomCats] = useState<string[]>(() => dataStore.getCustomCategories());
  const [categoryRecords, setCategoryRecords] = useState<any[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);

  useEffect(() => {
    const unsub = dataStore.subscribe(() => {
      setDisplayProducts(dataStore.getProducts(managerBranchId));
      setCustomCats(dataStore.getCustomCategories());
    });
    return () => unsub();
  }, [managerBranchId]);

  useEffect(() => {
    let cancelled = false;
    setCategoryLoading(true);
    api.categories.list()
      .then((res: any) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setCategoryRecords(rows);
        setCustomCats(rows.map((c: any) => c.name).filter(Boolean));
      })
      .catch((error: any) => {
        console.error('[ManagerMenu] Category load failed:', error);
      })
      .finally(() => { if (!cancelled) setCategoryLoading(false); });
    return () => { cancelled = true; };
  }, [managerBranchId]);

  const allCategories = useMemo(() => {
    const fromProducts = displayProducts.map(p => (p.category || 'Mains').trim());
    return Array.from(new Set([...fromProducts, ...customCats])).filter(Boolean);
  }, [displayProducts, customCats]);

  const filteredCategoriesList = useMemo(() => {
    if (!catSearchText.trim()) return allCategories;
    return allCategories.filter(c => c.toLowerCase().includes(catSearchText.trim().toLowerCase()));
  }, [allCategories, catSearchText]);

  const handleAddCat = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCatName.trim();
    if (!name || categoryLoading) return;
    setCategoryLoading(true);
    try {
      const existing = categoryRecords.find((c: any) => String(c.name || '').trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        setNewCatName('');
        return;
      }
      const res = await api.categories.create({ name });
      const created = res?.data;
      if (!created?.id) throw new Error('Category was not returned by the server');
      setCategoryRecords(prev => [...prev, created]);
      setCustomCats(prev => Array.from(new Set([...prev, created.name])));
      setNewCatName('');
      vibrate(20);
    } catch (error: any) {
      console.error('[ManagerMenu] Category create failed:', error);
      alert(error?.message || 'Failed to save category. Please try again.');
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleCreateCategoryInline = async () => {
    const newCat = catSearchText.trim();
    if (!newCat || categoryLoading) return;
    setCategoryLoading(true);
    try {
      const existing = categoryRecords.find((c: any) => String(c.name || '').trim().toLowerCase() === newCat.toLowerCase());
      if (existing) {
        setFormData(prev => ({ ...prev, category: existing.name }));
        setIsCatDropdownOpen(false);
        setCatSearchText('');
        return;
      }
      const res = await api.categories.create({ name: newCat });
      const created = res?.data;
      if (!created?.id) throw new Error('Category was not saved');
      setCategoryRecords(prev => [...prev, created]);
      setCustomCats(prev => Array.from(new Set([...prev, created.name])));
      setFormData(prev => ({ ...prev, category: created.name, categoryId: created.id }));
      setIsCatDropdownOpen(false);
      setCatSearchText('');
      vibrate(20);
    } catch (error: any) {
      console.error('[ManagerMenu] Inline category create failed:', error);
      alert(error?.message || 'Failed to save category.');
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleDeleteCat = async (cat: string) => {
    const record = categoryRecords.find((c: any) => String(c.name || '').trim().toLowerCase() === cat.trim().toLowerCase());
    if (!record?.id) return;
    try {
      await api.categories.delete(record.id);
      setCategoryRecords(prev => prev.filter((c: any) => c.id !== record.id));
      setCustomCats(prev => prev.filter(c => c.toLowerCase() !== cat.trim().toLowerCase()));
      vibrate(30);
    } catch (error: any) {
      console.error('[ManagerMenu] Category delete failed:', error);
      alert(error?.message || 'Failed to delete category. Please try again.');
    }
  };

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    category: 'mains',
    description: '',
    image: '',
  });
  const [uploading, setUploading] = useState(false);

  const availableIngredients = dataStore.getIngredients(managerBranchId);

  const filteredProducts = displayProducts.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    (p.category || '').toLowerCase().includes(search.toLowerCase())
  );

  const toggleProductAvailability = (id: string) => {
    vibrate(40);
    dataStore.toggleProductAvailability(id);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const form = new FormData();
    form.append('image', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: form
      });
      const data = await res.json();
      if (data.url) {
        setFormData(prev => ({ ...prev, image: data.url }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.price) return;

    setLoading(true);
    try {
      const branchObj = dataStore.getBranches().find(b => b.id === managerBranchId || b.name === managerBranchId);
      const productPayload = {
        name: formData.name,
        price: parseFloat(formData.price),
        category: formData.category as any,
        categoryId: categoryRecords.find((c: any) => String(c.name || '').trim().toLowerCase() === String(formData.category || '').trim().toLowerCase())?.id,
        description: formData.description.trim() || undefined,
        image: formData.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
        branchId: managerBranchId ?? undefined,
        branchName: branchObj?.name ?? undefined,
        addOns: addOns
          .filter(a => a.name.trim())
          .map(a => ({ id: a.id || `addon-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: a.name.trim(), priceUGX: Number(a.priceUGX) || 0 })),
      };

      let targetProductId = '';
      if (isEditing) {
        targetProductId = isEditing.id;
        const updated = await dataStore.updateProduct(isEditing.id, productPayload);
        if (updated === false) throw new Error('Menu item could not be saved to the database');
      } else {
        const newProduct = await dataStore.addProduct(productPayload);
        if (!newProduct?.id) throw new Error('Menu item was not saved to the database');
        targetProductId = newProduct.id;
      }

      // Save recipe ingredients mapping to database and local store
      const validRecipe = recipe.filter(r => r.ingredientId && r.quantityPerUnit > 0);
      const recipeSaved = await dataStore.saveProductIngredients(targetProductId, validRecipe, managerBranchId || undefined);
      if (recipeSaved === false) throw new Error('Menu item saved, but recipe could not be saved. Please retry before leaving this screen.');

      setIsEditing(null);
      setIsAdding(false);
      setFormData({ name: '', price: '', category: 'mains', description: '', image: '' });
      setRecipe([]);
      setAddOns([]);
      vibrate([30, 50]);
    } catch (err) {
      console.error('[ManagerMenu] Error saving product:', err);
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (product: any) => {
    setIsEditing(product);
    setFormData({
      name: product.name,
      price: product.price.toString(),
      category: product.category || '',
      description: product.description || '',
      image: product.image || '',
    });

    // Load recipe mappings
    const currentRecipe = dataStore.getProductIngredients(product.id).map(pi => ({
      ingredientId: pi.ingredientId,
      quantityPerUnit: pi.quantityPerUnit
    }));
    setRecipe(currentRecipe);
    setAddOns((product.addOns || []).map((a: any) => ({ id: a.id, name: a.name, priceUGX: String(a.priceUGX ?? a.price ?? 0) })));
  };

  const openAdd = () => {
    setIsAdding(true);
    setFormData({ name: '', price: '', category: 'mains', description: '', image: '' });
    setRecipe([]);
    setAddOns([]);
  };

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Menu Items</h2>
          <p className="text-slate-500 font-medium text-xs">Manage menu prices, availability, and recipe stock deductions</p>
        </div>
        <div className="flex gap-2">
          <button 
            type="button"
            onClick={() => { vibrate(20); setShowCatsModal(true); }}
            className="bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-900 dark:text-white px-5 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all active:scale-95 border border-black/5 dark:border-white/5"
          >
            Manage Categories
          </button>
          <button 
            onClick={() => { vibrate(20); openAdd(); }}
            className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Add New Item
          </button>
        </div>
      </div>

      <div className="bg-white/80 dark:bg-[#121214]/80 backdrop-blur-2xl border border-white/40 dark:border-white/5 shadow-2xl rounded-[2rem] p-6 ring-1 ring-black/5 dark:ring-white/10 flex-1 flex flex-col overflow-hidden">
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input 
            type="text"
            placeholder="Search menu products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-black/20 border border-black/5 dark:border-white/10 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:text-white text-sm font-medium"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start auto-rows-max overflow-y-auto custom-scrollbar pr-2 flex-1">
          {filteredProducts.map(product => {
            const productRecipe = dataStore.getProductIngredients(product.id);
            return (
              <div key={product.id} className="bg-slate-50 dark:bg-black/20 p-4 rounded-2xl border border-black/5 dark:border-white/5 flex flex-col justify-between shadow-sm hover:border-orange-500/30 transition-all gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {product.image?.startsWith('http') ? (
                      <Image src={product.image} alt={product.name} width={48} height={48} className="w-12 h-12 rounded-xl object-cover" unoptimized />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center font-bold text-lg">
                        {product.image || '🍲'}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">{product.name}</h4>
                        {productRecipe.length > 0 && (
                          <span className="bg-green-500/10 text-green-600 dark:text-green-400 text-[9px] font-extrabold px-2 py-0.5 rounded-full" title="Deducts stock automatically when sold">
                            ⚡ Recipe ({productRecipe.length})
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-orange-500 mt-0.5">{formatUGX(product.price)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(product)}
                      className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-300 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleProductAvailability(product.id)}
                      className={`w-14 h-8 rounded-full transition-colors flex items-center px-1 ${product.available !== false ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                    >
                      <motion.div 
                        className="w-6 h-6 bg-white rounded-full shadow-sm"
                        animate={{ x: product.available !== false ? 24 : 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>
                </div>

                {productRecipe.length > 0 && (
                  <div className="border-t border-black/5 dark:border-white/5 pt-2">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block mb-1">Recipe Ingredients</span>
                    <div className="flex flex-wrap gap-1">
                      {productRecipe.map(pi => {
                        const ing = availableIngredients.find(i => i.id === pi.ingredientId);
                        return (
                          <span key={pi.id} className="bg-slate-100 dark:bg-white/5 text-[9px] font-semibold px-2 py-0.5 rounded-md text-slate-600 dark:text-slate-300">
                            {ing?.name || 'Ingredient'}: {pi.quantityPerUnit} {ing?.unit || ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit / Create Product Modal */}
      <AnimatePresence>
        {(isAdding || isEditing) && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#121214] w-full max-w-md rounded-[2.5rem] p-6 shadow-2xl space-y-4 border border-black/10 dark:border-white/10"
            >
              <h3 className="text-2xl font-bold dark:text-white">{isEditing ? 'Edit Menu Item' : 'Add New Menu Item'}</h3>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Item Name *</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border dark:border-white/10 rounded-xl p-3 bg-slate-50 dark:bg-black/20 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-orange-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Price (UGX) *</label>
                  <input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full border dark:border-white/10 rounded-xl p-3 bg-slate-50 dark:bg-black/20 dark:text-white font-bold text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Category *</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsCatDropdownOpen(!isCatDropdownOpen)}
                      className="w-full border dark:border-white/10 rounded-xl p-3 bg-slate-50 dark:bg-black/20 text-slate-900 dark:text-white text-sm font-bold flex items-center justify-between focus:ring-2 focus:ring-orange-500 outline-none text-left"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span className="text-base">{getCategoryIcon(formData.category || 'Mains')}</span>
                        <span>{formData.category || 'Select Category...'}</span>
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>

                    {isCatDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1A1A1E] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl z-50 p-2 space-y-2 max-h-60 flex flex-col">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            autoFocus
                            placeholder="Search or filter categories..."
                            value={catSearchText}
                            onChange={e => setCatSearchText(e.target.value)}
                            className="w-full bg-slate-100 dark:bg-black/40 border border-black/5 dark:border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                          {filteredCategoriesList.map(cat => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({ ...prev, category: cat }));
                                setIsCatDropdownOpen(false);
                                setCatSearchText('');
                              }}
                              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition-colors ${
                                formData.category === cat
                                  ? 'bg-orange-500 text-white'
                                  : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <span>{getCategoryIcon(cat)}</span>
                                <span>{cat}</span>
                              </span>
                              {formData.category === cat && <Check className="w-4 h-4 shrink-0" />}
                            </button>
                          ))}

                          {catSearchText.trim() && !filteredCategoriesList.some(c => c.toLowerCase() === catSearchText.trim().toLowerCase()) && (
                            <button
                              type="button"
                              onClick={handleCreateCategoryInline}
                              className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-orange-500 hover:bg-orange-500/10 flex items-center gap-2 border border-dashed border-orange-500/30"
                            >
                              <Plus className="w-4 h-4 shrink-0" />
                              <span>Create &quot;{catSearchText.trim()}&quot;</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Description (Ingredients / Menu Details)</label>
                  <textarea 
                    rows={2}
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                    placeholder="e.g. Chicken breast, lettuce, tomato, fried egg, served with side dish..."
                    className="w-full border dark:border-white/10 rounded-xl p-3 bg-slate-50 dark:bg-black/20 dark:text-white text-xs focus:ring-2 focus:ring-orange-500 outline-none resize-none" 
                  />
                </div>

                {/* Recipe Editor */}
                <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl space-y-2">
                  <span className="font-bold text-xs text-slate-900 dark:text-white block">Recipe (Ingredients Consumed)</span>
                  
                  <div className="space-y-2 max-h-36 overflow-y-auto custom-scrollbar">
                    {recipe.map((item, idx) => {
                      const ing = availableIngredients.find(i => i.id === item.ingredientId);
                      return (
                        <div key={idx} className="flex gap-2 items-center bg-white dark:bg-black/40 p-2 rounded-xl border border-black/5 dark:border-white/5">
                          <select
                            required
                            value={item.ingredientId}
                            onChange={e => {
                              const updated = [...recipe];
                              updated[idx].ingredientId = e.target.value;
                              setRecipe(updated);
                            }}
                            className="flex-1 bg-transparent dark:text-white text-xs font-bold focus:outline-none dark:bg-[#121214]"
                          >
                            <option value="">Choose Ingredient</option>
                            {availableIngredients.map(i => (
                              <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                            ))}
                          </select>
                          <input
                            required
                            type="number"
                            step="any"
                            placeholder="Qty"
                            value={item.quantityPerUnit || ''}
                            onChange={e => {
                              const updated = [...recipe];
                              updated[idx].quantityPerUnit = parseFloat(e.target.value) || 0;
                              setRecipe(updated);
                            }}
                            className="w-16 bg-transparent border-b border-black/10 dark:border-white/10 dark:text-white text-xs font-bold text-center focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-500 font-bold shrink-0">{ing?.unit || ''}</span>
                          <button
                            type="button"
                            onClick={() => setRecipe(recipe.filter((_, i) => i !== idx))}
                            className="text-red-500 hover:text-red-600 font-extrabold text-sm px-1.5"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setRecipe([...recipe, { ingredientId: '', quantityPerUnit: 1 }])}
                    className="w-full py-2 bg-white dark:bg-black/30 dark:text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 hover:bg-orange-500/10 border border-orange-500/20"
                  >
                    + Add Recipe Ingredient
                  </button>
                </div>

                {/* Add-Ons Editor */}
                <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-2xl space-y-2">
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-white block">Add-Ons (Extras Sold With This Item)</span>
                    <span className="text-[10px] text-slate-500">e.g. Extra Cheese, Extra Beef Patty — shown on the POS when a waiter adds this meal</span>
                  </div>

                  <div className="space-y-2 max-h-36 overflow-y-auto custom-scrollbar">
                    {addOns.map((a, idx) => (
                      <div key={idx} className="flex gap-2 items-center bg-white dark:bg-black/40 p-2 rounded-xl border border-black/5 dark:border-white/5">
                        <input
                          value={a.name}
                          onChange={e => {
                            const updated = [...addOns];
                            updated[idx] = { ...updated[idx], name: e.target.value };
                            setAddOns(updated);
                          }}
                          placeholder="e.g. Extra Cheese"
                          className="flex-1 bg-transparent dark:text-white text-xs font-bold focus:outline-none border-b border-transparent focus:border-purple-400"
                        />
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={a.priceUGX ?? ''}
                          onChange={e => {
                            const updated = [...addOns];
                            updated[idx] = { ...updated[idx], priceUGX: e.target.value };
                            setAddOns(updated);
                          }}
                          placeholder="Price (UGX)"
                          className="w-24 bg-transparent dark:text-white text-xs font-bold text-right focus:outline-none border-b border-transparent focus:border-purple-400"
                        />
                        <button
                          type="button"
                          onClick={() => setAddOns(addOns.filter((_, i) => i !== idx))}
                          className="text-red-500 hover:text-red-600 font-extrabold text-sm px-1.5"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  {addOns.length === 0 && (
                    <p className="text-[10px] text-slate-400 italic">No add-ons yet. Customers will only see extras if you add them here.</p>
                  )}

                  <button
                    type="button"
                    onClick={() => setAddOns([...addOns, { id: `addon-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: '', priceUGX: '0' }])}
                    className="w-full py-2 bg-white dark:bg-black/30 dark:text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 hover:bg-purple-500/10 border border-purple-500/20"
                  >
                    + Add Add-On Option
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Image (URL or Upload)</label>
                  <div className="flex gap-2">
                    <input value={formData.image} onChange={e => setFormData({...formData, image: e.target.value})} className="flex-1 border dark:border-white/10 rounded-xl p-3 bg-slate-50 dark:bg-black/20 dark:text-white text-sm" />
                    <label className="w-12 h-12 bg-slate-200 dark:bg-white/10 rounded-xl flex items-center justify-center cursor-pointer hover:bg-slate-300 transition-colors shrink-0">
                      {uploading ? <Loader2 className="w-5 h-5 animate-spin dark:text-white" /> : <ImageIcon className="w-5 h-5 dark:text-white" />}
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                  </div>
                  {formData.image.startsWith('http') && (
                    <Image src={formData.image} alt="Preview" width={64} height={64} className="w-16 h-16 object-cover rounded-xl mt-2" unoptimized />
                  )}
                </div>
                <div className="flex gap-3 pt-3">
                  <button type="button" onClick={() => { setIsAdding(false); setIsEditing(null); }} className="flex-1 py-3 font-bold rounded-xl bg-slate-100 dark:bg-white/5 dark:text-white hover:bg-slate-200 text-sm">Cancel</button>
                  <button type="submit" disabled={loading || uploading} className="flex-1 py-3 font-bold rounded-xl bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 text-sm shadow-md">Save Item</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Categories Manager Modal */}
      <AnimatePresence>
        {showCatsModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#121214] w-full max-w-md rounded-[2.5rem] p-6 shadow-2xl space-y-4 border border-black/10 dark:border-white/10 flex flex-col max-h-[80vh]"
            >
              <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/5">
                <h3 className="text-xl font-bold dark:text-white">Manage Menu Categories</h3>
                <button onClick={() => setShowCatsModal(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* Add Category Form */}
              <form onSubmit={handleAddCat} className="flex gap-2">
                <input 
                  type="text" 
                  required
                  placeholder="New Category (e.g. Pastries)..."
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  className="flex-1 border dark:border-white/10 rounded-xl p-2.5 bg-slate-50 dark:bg-black/20 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-orange-500 outline-none"
                />
                <button 
                  type="submit" 
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 rounded-xl text-xs font-bold transition-all active:scale-95"
                >
                  {categoryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                </button>
              </form>

              {/* Categories List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider block">Active Categories</span>
                {allCategories.map(cat => {
                  const isCustom = customCats.some(c => c.toLowerCase() === cat.toLowerCase());
                  return (
                    <div key={cat} className="flex items-center justify-between bg-slate-50 dark:bg-black/20 p-3 rounded-xl border border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{getCategoryIcon(cat)}</span>
                        <span className="font-bold text-xs text-slate-900 dark:text-white">{cat}</span>
                      </div>
                      {isCustom ? (
                        <button 
                          type="button"
                          onClick={() => handleDeleteCat(cat)} 
                          className="p-1.5 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                          title="Remove custom category"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-200/50 dark:bg-white/10 px-2 py-0.5 rounded">
                          Linked
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <datalist id="categories-list">
        {allCategories.map(c => <option key={c} value={c} />)}
      </datalist>
    </div>
  );
}
