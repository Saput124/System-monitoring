import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';

/**
 * MaterialPreview Component
 * 
 * Shows material requirements preview before creating activity plan
 * - Fetches SOP materials based on activity/stage selection
 * - Calculates quantities based on block areas
 * - Groups by kategori PC/RC
 * - Shows conflicts if any
 */
const MaterialPreview = ({ 
  activityTypeId, 
  stageId = null, 
  selectedBlocks = [],
  tanamanKategori = null // PC, RC, or null (both)
}) => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [blockSummary, setBlockSummary] = useState({ PC: { count: 0, luas: 0 }, RC: { count: 0, luas: 0 } });

  useEffect(() => {
    if (activityTypeId && selectedBlocks.length > 0) {
      fetchMaterialPreview();
      calculateBlockSummary();
    } else {
      setMaterials([]);
    }
  }, [activityTypeId, stageId, selectedBlocks, tanamanKategori]);

  const calculateBlockSummary = () => {
    const summary = { 
      PC: { count: 0, luas: 0, blocks: [] }, 
      RC: { count: 0, luas: 0, blocks: [] } 
    };

    selectedBlocks.forEach(block => {
      const kategori = block.tanaman_kategori || 'PC';
      summary[kategori].count++;
      summary[kategori].luas += parseFloat(block.luas_blok || 0);
      summary[kategori].blocks.push(block.kode_blok);
    });

    setBlockSummary(summary);
  };

  const fetchMaterialPreview = async () => {
    setLoading(true);
    setError(null);

    try {
      // Build query for SOP materials
      let query = supabase
        .from('activity_materials')
        .select(`
          id,
          default_dosis,
          unit,
          required,
          tanaman_kategori,
          material:materials (
            id,
            code,
            name,
            category
          )
        `)
        .eq('activity_type_id', activityTypeId);

      // Filter by stage if provided
      if (stageId) {
        query = query.eq('stage_id', stageId);
      } else {
        // For activities without stages (direct materials)
        query = query.is('stage_id', null);
      }

      // Filter by kategori if specified
      if (tanamanKategori) {
        query = query.or(`tanaman_kategori.eq.${tanamanKategori},tanaman_kategori.is.null`);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Calculate quantities per block kategori
      const calculatedMaterials = data.map(mat => {
        const dosisAsli = mat.default_dosis;
        const unit = mat.unit;

        // Calculate for PC blocks
        const pcBlocks = selectedBlocks.filter(b => 
          (b.tanaman_kategori || 'PC') === 'PC' && 
          (!mat.tanaman_kategori || mat.tanaman_kategori === 'PC')
        );
        const luasPC = pcBlocks.reduce((sum, b) => sum + parseFloat(b.luas_blok || 0), 0);
        const totalPC = luasPC * dosisAsli;

        // Calculate for RC blocks
        const rcBlocks = selectedBlocks.filter(b => 
          b.tanaman_kategori === 'RC' && 
          (!mat.tanaman_kategori || mat.tanaman_kategori === 'RC')
        );
        const luasRC = rcBlocks.reduce((sum, b) => sum + parseFloat(b.luas_blok || 0), 0);
        const totalRC = luasRC * dosisAsli;

        return {
          ...mat,
          dosisAsli,
          calculations: {
            PC: { luas: luasPC, total: totalPC, blocks: pcBlocks.length },
            RC: { luas: luasRC, total: totalRC, blocks: rcBlocks.length }
          },
          grandTotal: totalPC + totalRC
        };
      });

      setMaterials(calculatedMaterials);

    } catch (err) {
      console.error('Error fetching material preview:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!activityTypeId || selectedBlocks.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <span className="ml-3 text-gray-600">Menghitung material...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">⚠️ Error: {error}</p>
      </div>
    );
  }

  if (materials.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-700">ℹ️ Belum ada SOP material untuk kombinasi ini</p>
      </div>
    );
  }

  // Check for kategori conflicts
  const hasPC = blockSummary.PC.count > 0;
  const hasRC = blockSummary.RC.count > 0;
  const hasMixed = hasPC && hasRC;
  const hasKategoriSpecificMaterials = materials.some(m => m.tanaman_kategori !== null);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">📋 Preview Material</h3>
      </div>

      <div className="p-6">
        {/* Block Summary */}
        <div className="mb-6 bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-700 mb-3">Blok yang Dipilih:</h4>
          <div className="grid grid-cols-2 gap-4">
            {hasPC && (
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <div className="text-green-800 font-semibold">Plant Cane (PC)</div>
                <div className="text-sm text-green-600 mt-1">
                  {blockSummary.PC.count} blok • {blockSummary.PC.luas.toFixed(2)} Ha
                </div>
                <div className="text-xs text-green-500 mt-1">
                  {blockSummary.PC.blocks.join(', ')}
                </div>
              </div>
            )}
            {hasRC && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <div className="text-blue-800 font-semibold">Ratoon Cane (RC)</div>
                <div className="text-sm text-blue-600 mt-1">
                  {blockSummary.RC.count} blok • {blockSummary.RC.luas.toFixed(2)} Ha
                </div>
                <div className="text-xs text-blue-500 mt-1">
                  {blockSummary.RC.blocks.join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Kategori Conflict Warning */}
        {hasMixed && hasKategoriSpecificMaterials && (
          <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  ⚠️ Perhatian: Material berbeda untuk PC dan RC
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>Beberapa material memiliki dosis berbeda untuk PC dan RC. Pastikan Anda memeriksa perhitungan di bawah.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Material Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Material
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Kategori
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dosis/Ha
                </th>
                {hasPC && (
                  <>
                    <th className="px-4 py-3 text-right text-xs font-medium text-green-600 uppercase tracking-wider">
                      Luas PC
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-green-600 uppercase tracking-wider">
                      Total PC
                    </th>
                  </>
                )}
                {hasRC && (
                  <>
                    <th className="px-4 py-3 text-right text-xs font-medium text-blue-600 uppercase tracking-wider">
                      Luas RC
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-blue-600 uppercase tracking-wider">
                      Total RC
                    </th>
                  </>
                )}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-900 uppercase tracking-wider bg-gray-100">
                  Grand Total
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {materials.map((mat) => (
                <tr key={mat.id} className={!mat.required ? 'bg-gray-50' : ''}>
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {mat.material.name}
                          {!mat.required && (
                            <span className="ml-2 text-xs text-gray-500">(Optional)</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{mat.material.code}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      mat.tanaman_kategori === 'PC' ? 'bg-green-100 text-green-800' :
                      mat.tanaman_kategori === 'RC' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {mat.tanaman_kategori || 'Both'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">
                    {mat.dosisAsli.toFixed(2)} {mat.unit}
                  </td>
                  {hasPC && (
                    <>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">
                        {mat.calculations.PC.luas > 0 ? `${mat.calculations.PC.luas.toFixed(2)} Ha` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-green-700">
                        {mat.calculations.PC.total > 0 ? `${mat.calculations.PC.total.toFixed(2)} ${mat.unit}` : '-'}
                      </td>
                    </>
                  )}
                  {hasRC && (
                    <>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">
                        {mat.calculations.RC.luas > 0 ? `${mat.calculations.RC.luas.toFixed(2)} Ha` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-blue-700">
                        {mat.calculations.RC.total > 0 ? `${mat.calculations.RC.total.toFixed(2)} ${mat.unit}` : '-'}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 bg-gray-100">
                    {mat.grandTotal.toFixed(2)} {mat.unit}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={hasPC && hasRC ? 8 : hasPC || hasRC ? 6 : 4} className="px-4 py-3 text-sm text-gray-600">
                  <div className="flex items-center justify-between">
                    <span>
                      ✓ {materials.filter(m => m.required).length} material wajib, 
                      {materials.filter(m => !m.required).length} optional
                    </span>
                    <span className="text-xs text-gray-500">
                      Perhitungan: Dosis/Ha × Luas Blok
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Calculation Details */}
        <div className="mt-4 text-xs text-gray-500 bg-gray-50 rounded p-3">
          <p className="font-medium mb-1">Detail Kalkulasi:</p>
          <ul className="list-disc list-inside space-y-1">
            {materials.slice(0, 2).map(mat => (
              <li key={mat.id}>
                <strong>{mat.material.code}:</strong> 
                {hasPC && mat.calculations.PC.total > 0 && (
                  <span className="text-green-600"> PC: {mat.calculations.PC.luas.toFixed(2)} Ha × {mat.dosisAsli} = {mat.calculations.PC.total.toFixed(2)} {mat.unit}</span>
                )}
                {hasPC && hasRC && mat.calculations.PC.total > 0 && mat.calculations.RC.total > 0 && ' + '}
                {hasRC && mat.calculations.RC.total > 0 && (
                  <span className="text-blue-600"> RC: {mat.calculations.RC.luas.toFixed(2)} Ha × {mat.dosisAsli} = {mat.calculations.RC.total.toFixed(2)} {mat.unit}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export dMaterialPreviewPreview;